import multer from "multer";

/* FILE STORAGE */
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "public/uploads");
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname);
    },
  });
  export const upload = multer({ storage });
  