import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user";

// REGISTER USER

export const register = async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        email,
        password,
      } = req.body; // retreave registration fields data from req body
  
      const salt = await bcrypt.genSalt(); // Salt to be used to hash the password
      const passwordHash = await bcrypt.hash(password, salt); // Encrypt password
  
      const newUser = new User({
        firstName,
        lastName,
        email,
        password: passwordHash, // Encrypted password
      }); // Store the req into a User object

      const savedUser = await newUser.save(); // Create a new user
      res.status(201).json({user: savedUser, message: 'User created successfully'}); // Send status code that user has been created
    } catch (err) {
      res.status(500).json({ error: err.message }); // Throw an error if mongodb can not save the new user
    }
  };
  
  /* LOGGING IN */
  export const login = async (req, res) => {
    try {
      const { email, password } = req.body; // Retreave login fields data from req body
      const user = await User.findOne({ email: email }); // Find the user with this unique email

      if (!user) return res.status(400).json({ msg: "User does not exist. " });  // Throw an error if a user with that email does not exist 
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ msg: "Invalid credentials. " }); // Throw an error if the password does not match
  
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET); // Encode the user id into a JWT, thus assigning it to the user
      delete user.password; // Delete the password so it does not get sent back to the frontend
      res.status(200).json({ token, user }); // return the token to the frontend (browser)
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };