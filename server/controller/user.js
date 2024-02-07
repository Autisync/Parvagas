import User from "../models/user";
import bcrypt from "bcrypt";


/* READ */
export const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    res.status(200).json(user);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

/* UPDATE */
export const updatePassword = async (req, res) => {
  try {
    const { id, password } = req.params;
    
    
    const salt = await bcrypt.genSalt(); // Salt to be used to hash the password
    const passwordHash = await bcrypt.hash(password, salt); // Encrypt password
    
    const isMatch = await bcrypt.compare(passwordHash, user.password);
    if (isMatch) return res.status(400).json({ msg: "Password currently in use " });
    const user = await User.findByIdAndUpdate(id, { password: passwordHash })
    res.status(200).json({ msg: "Password updated successfully " }); 
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};