import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Company from "../models/company.js";
import CandidateProfile from "../models/candidateProfile.js";
import CompanyInvite from "../models/companyInvite.js";
import { sendEmailNotification } from "../services/notificationService.js";
import { logAudit } from "../services/auditService.js";
import { normalizeAdminLevel } from "../services/rbacService.js";

const normalizeCompanyTeamRole = (value) => {
  const role = String(value || "").trim().toLowerCase();
  if (["owner", "manager", "recruiter", "viewer"].includes(role)) return role;
  return "recruiter";
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validatePasswordStrength = (password) => {
  if (String(password || "").length < 8) return "A nova password deve ter pelo menos 8 caracteres.";
  if (!/[A-Z]/.test(password)) return "A nova password deve incluir pelo menos 1 letra maiúscula.";
  if (!/[a-z]/.test(password)) return "A nova password deve incluir pelo menos 1 letra minúscula.";
  if (!/[0-9]/.test(password)) return "A nova password deve incluir pelo menos 1 número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "A nova password deve incluir pelo menos 1 símbolo.";
  return "";
};

const getAppBaseUrl = () => {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:3000"
  );
};

const mapJwtResetError = (error) => {
  if (!error) return "Token inválido.";
  if (error.name === "TokenExpiredError") return "Este link expirou. Solicite um novo link de recuperação.";
  if (error.name === "JsonWebTokenError") return "Token inválido.";
  return "Token inválido.";
};

const signAuthToken = (user) => {
  const normalizedAdminLevel = user.role === "admin" ? normalizeAdminLevel(user.adminLevel) : undefined;
  const companyTeamRole = user.role === "company" ? normalizeCompanyTeamRole(user.companyTeamRole || user.teamRole) : undefined;
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      suspended: user.suspended,
      ...(user.role === "admin" ? { adminLevel: normalizedAdminLevel } : {}),
      ...(user.role === "company"
        ? {
            companyId: user.companyId || null,
            companyTeamRole,
          }
        : {}),
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

const toPublicUser = (user) => {
  const userObject = typeof user?.toObject === "function" ? user.toObject() : { ...(user || {}) };
  if (userObject.role === "admin") {
    userObject.adminLevel = normalizeAdminLevel(userObject.adminLevel);
  }
  if (userObject.role === "company") {
    userObject.companyTeamRole = normalizeCompanyTeamRole(userObject.companyTeamRole || userObject.teamRole);
  }
  userObject.id = String(userObject._id || userObject.id || "");
  userObject.hasCompletedOnboarding = Boolean(userObject.hasCompletedOnboarding ?? true);
  userObject.hasSeenTutorial = Boolean(userObject.hasSeenTutorial ?? false);
  delete userObject.password;
  return userObject;
};

export const register = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      role = "candidate",
      adminLevel,
      adminSignupKey,
      companyName,
      legalName,
      nif,
    } = req.body;

    const normalizedRole = String(role || "candidate").trim().toLowerCase();

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "fullName, email e password são obrigatórios." });
    }

    if (!["candidate", "company", "admin"].includes(normalizedRole)) {
      return res.status(400).json({ error: "Role inválido. Use candidate ou company." });
    }

    if (normalizedRole === "admin") {
      const requiredKey = String(process.env.ADMIN_SIGNUP_KEY || "").trim();
      if (!requiredKey || String(adminSignupKey || "").trim() !== requiredKey) {
        return res.status(403).json({ error: "Chave de registo admin inválida." });
      }
    }

    let normalizedNif = "";
    if (normalizedRole === "company") {
      if (!String(companyName || "").trim()) {
        return res.status(400).json({ error: "companyName é obrigatório." });
      }
      if (!String(nif || "").trim()) {
        return res.status(400).json({ error: "NIF/identificador da empresa é obrigatório." });
      }
      normalizedNif = String(nif).trim().replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z0-9]{6,20}$/.test(normalizedNif)) {
        return res.status(400).json({ error: "NIF inválido." });
      }

      const existingCompany = await Company.findOne({ nif: normalizedNif });
      if (existingCompany) {
        return res.status(409).json({ error: "Já existe uma empresa registada com este NIF." });
      }
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: "Email já está em uso." });
    }

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    const savedUser = await User.create({
      fullName,
      email: normalizedEmail,
      password: passwordHash,
      role: normalizedRole,
      ...(normalizedRole === "candidate" ? { hasCompletedOnboarding: false, hasSeenTutorial: false } : {}),
      ...(normalizedRole === "admin"
        ? {
            adminLevel: normalizeAdminLevel(adminLevel),
            firstLoginRequired: true,
          }
        : {}),
    });

    if (normalizedRole === "company") {
      const company = await Company.create({
        name: String(companyName).trim(),
        legalName: String(legalName || companyName).trim(),
        nif: normalizedNif,
        ownerUserId: savedUser._id,
        createdByUserId: savedUser._id,
        contactEmail: normalizedEmail,
        verificationStatus: "pending",
      });

      await User.findByIdAndUpdate(savedUser._id, { companyId: company._id }, { new: true });
      await User.findByIdAndUpdate(savedUser._id, { companyTeamRole: "owner" }, { new: true });
    }

    if (normalizedRole === "candidate") {
      await CandidateProfile.findOneAndUpdate(
        { userId: savedUser._id },
        {
          userId: savedUser._id,
          fullName: String(fullName || "").trim(),
          email: normalizedEmail,
          phone: "",
          location: "",
          professionalTitle: "",
          summary: "",
          professionalSummary: "",
          preferredJobType: "",
          availability: "",
          expectedSalaryAoa: null,
          skills: [],
          languages: [],
          certifications: [],
          experience: [],
          education: [],
        },
        { new: true, upsert: true }
      );
    }

    await logAudit({
      actorUserId: savedUser._id,
      action: "user.register",
      resourceType: "User",
      resourceId: String(savedUser._id),
    });

    const userObject = toPublicUser(savedUser);
    return res.status(201).json({ user: userObject, message: "Conta criada com sucesso." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!String(email || "").trim() || !String(password || "").trim()) {
      return res.status(400).json({ error: "Email e palavra-passe são obrigatórios." });
    }

    const user = await User.findOne({ email: String(email || "").trim().toLowerCase() });

    if (!user) return res.status(401).json({ error: "Credenciais inválidas." });
    if (user.suspended) return res.status(403).json({ error: "Conta suspensa." });

    const isMatch = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!isMatch) return res.status(401).json({ error: "Credenciais inválidas." });

    if (user.role === "admin" && user.firstLoginRequired) {
      const resetToken = jwt.sign(
        {
          userId: user._id,
          purpose: "first-login-reset",
          role: "admin",
        },
        process.env.JWT_SECRET,
        { expiresIn: "20m" }
      );

      return res.status(428).json({
        requiresPasswordReset: true,
        resetToken,
      });
    }

    const token = signAuthToken(user);

    const userObject = toPublicUser(user);
    return res.status(200).json({ token, user: userObject });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const firstLoginReset = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: "resetToken e newPassword são obrigatórios." });
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({ error: mapJwtResetError(error) });
    }

    if (decoded?.purpose !== "first-login-reset" || !decoded?.userId) {
      return res.status(400).json({ error: "Token inválido." });
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.role !== "admin") return res.status(404).json({ error: "Utilizador não encontrado." });

    const isReuse = await bcrypt.compare(newPassword, user.password);
    if (isReuse) return res.status(400).json({ error: "A nova password deve ser diferente da atual." });

    const salt = await bcrypt.genSalt();
    user.password = await bcrypt.hash(newPassword, salt);
    user.firstLoginRequired = false;
    await user.save();

    const token = signAuthToken(user);
    const userObject = toPublicUser(user);

    return res.status(200).json({ token, user: userObject });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: "Informe um email válido." });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (user) {
      const resetToken = jwt.sign(
        {
          userId: user._id,
          purpose: "password-reset",
        },
        process.env.JWT_SECRET,
        { expiresIn: "20m" }
      );

      const resetLink = `${getAppBaseUrl()}/Login?resetToken=${encodeURIComponent(resetToken)}`;
      await sendEmailNotification({
        userId: user._id,
        toEmail: normalizedEmail,
        subject: "Parvagas | Recuperação de password",
        body: `Use este link para redefinir a password: ${resetLink}`,
        html: `<p>Use este link para redefinir a password:</p><p><a href=\"${resetLink}\">${resetLink}</a></p>`,
      });
    }

    return res.status(200).json({
      message: "Se existir uma conta com este email, será enviado um link de recuperação.",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: "resetToken e newPassword são obrigatórios." });
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({ error: mapJwtResetError(error) });
    }

    if (decoded?.purpose !== "password-reset" || !decoded?.userId) {
      return res.status(400).json({ error: "Token inválido." });
    }

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: "Utilizador não encontrado." });

    const isReuse = await bcrypt.compare(newPassword, user.password);
    if (isReuse) return res.status(400).json({ error: "A nova password deve ser diferente da atual." });

    const salt = await bcrypt.genSalt();
    user.password = await bcrypt.hash(newPassword, salt);
    user.firstLoginRequired = false;
    await user.save();

    return res.status(200).json({ message: "Password redefinida com sucesso." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const acceptCompanyInvite = async (req, res) => {
  try {
    const { inviteToken, fullName, password } = req.body;
    if (!inviteToken || !fullName || !password) {
      return res.status(400).json({ error: "inviteToken, fullName e password são obrigatórios." });
    }

    const invite = await CompanyInvite.findOne({ token: inviteToken, status: "pending" });
    if (!invite) return res.status(404).json({ error: "Convite inválido ou expirado." });

    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      invite.status = "expired";
      await invite.save();
      return res.status(400).json({ error: "Convite expirado." });
    }

    const existingUser = await User.findOne({ email: invite.email });
    if (existingUser) return res.status(409).json({ error: "Email já está em uso." });

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName,
      email: invite.email,
      password: passwordHash,
      role: "company",
      companyId: invite.companyId,
      companyTeamRole: normalizeCompanyTeamRole(invite.teamRole || "recruiter"),
      firstLoginRequired: true,
    });

    invite.status = "accepted";
    invite.acceptedAt = new Date().toISOString();
    invite.acceptedUserId = user._id;
    await invite.save();

    const token = signAuthToken(user);
    const userObject = user.toObject();
    userObject.companyTeamRole = normalizeCompanyTeamRole(userObject.companyTeamRole || userObject.teamRole);
    delete userObject.password;

    return res.status(201).json({
      token,
      user: userObject,
      message: "Convite aceite com sucesso.",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};