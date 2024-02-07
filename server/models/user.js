import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true,
            max: 50,
            min: 2
        },
        lastName: {
            type: String,
            required: true,
            max: 50,
            min: 2
        },
        email: {
            type: String,
            required: true,
            unique: true,            
            
        },
        password: {
            type: String,
            required: true,
            min: 8
        },
    }, 
    {timestamps: true}
);

const User = mongoose.model("User", UserSchema);
export default User;