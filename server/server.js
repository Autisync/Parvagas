import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { register } from "./controllers/auth.js";
import authRoutes from "./routes/auth.js";

// import userRoutes from "./routes/users.js";
// import postRoutes from "./routes/posts.js";
// import { createPost } from "./controllers/posts.js";
// import { verifyToken } from "./middleware/auth.js";
// import User from "./models/User.js";
// import Post from "./models/Post.js";
// import { users, posts } from "./data/index.js";

/* Middleware CONFIGURATIONS */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

const app = express(); //invoque express to use it as middleware
app.use(express.json());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(morgan("common"));
app.use(bodyParser.json({ limit: "50mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

/* FILE STORAGE */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

/* ROUTES WITH FILES */
// app.post("/auth/register", upload.single("picture"), register);
// app.post("/applications", verifyToken, upload.single("picture"), createPost);

/* ROUTES */
// app.use("/auth", authRoutes);
// app.use("/users", userRoutes);
// app.use("/applications", postRoutes);

/* MONGOOSE SETUP */
const PORT = process.env.PORT || 6001;
mongoose
  .connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    app.listen(PORT, () => console.log(`Server Port: ${PORT}`));

    /* ADD DATA ONE TIME */
    // User.insertMany(users);
    // Post.insertMany(posts);
  })
  .catch((error) => console.log(`${error} did not connect`));

  // Data models
  /*

  // User
  firstName (string)
  lastName (string)
  email (string)
  password (string)


  // Application
  id (string)
  jobId (string)
  fullName (string)
  dateOfBirth (date)
  email (string)
  cellphoneContact (string)
  gender (string)
  qualification (string)
  profession (string)
  expirienceInOilGas (boolean)
  yearsOfExperience (integer)
  residencialAddress (string)
  city (string)
  currentEmployer (string)
  nacionality (string)
  personalStatement (string)
  curriculumVitae (paths)
  otherDocuments (paths)
  progress (string)
  */