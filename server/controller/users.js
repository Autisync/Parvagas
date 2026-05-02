import User from "../models/user.js";
import bcrypt from "bcrypt";


/* READ */
export const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== "admin" && String(req.user.id) !== String(id)) {
      return res.status(403).json({ message: "Sem permissão" });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "Utilizador não encontrado" });
    const sanitized = user.toObject();
    delete sanitized.password;
    res.status(200).json(sanitized);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

/* UPDATE PASSWORD */
export const updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ msg: "currentPassword e newPassword são obrigatórios." });
    }

    if (req.user.role !== "admin" && String(req.user.id) !== String(id)) {
      return res.status(403).json({ msg: "Sem permissão" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ msg: "Utilizador não encontrado" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Password atual incorreta." });

    if (currentPassword === newPassword) {
      return res.status(400).json({ msg: "A nova password deve ser diferente da atual." });
    }

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await User.findByIdAndUpdate(id, { password: passwordHash });
    res.status(200).json({ msg: "Password atualizada com sucesso" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};