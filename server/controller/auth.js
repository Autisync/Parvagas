import bcrypt from "bcrypt";
import { Jwt } from "jsonwebtoken";
import User from "../models/user";

// REGISTER USER

export const register = async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        email,
        password,
      } = req.body;
  
      const salt = await bcrypt.genSalt(); // Salt to be used to hash the password
      const passwordHash = await bcrypt.hash(password, salt); // Encrypt password
  
      const newUser = new User({
        firstName,
        lastName,
        email,
        password: passwordHash, // Encrypted password
      }); // Store the req into a User object
      const savedUser = await newUser.save(); // Create a new user
      res.status(201).json(savedUser); // Send status code that something has been created
    } catch (err) {
      res.status(500).json({ error: err.message }); // Throw an error if mongodb can not save the new user
    }
  };
  
  /* LOGGING IN */
  export const login = async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email: email });
      if (!user) return res.status(400).json({ msg: "User does not exist. " });
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ msg: "Invalid credentials. " });
  
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      delete user.password;
      res.status(200).json({ token, user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };