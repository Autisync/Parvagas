import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
    {
        jobId: { type: String, default: "" }, // It is assumed that all applications that have an empty string are spontaneous applications
        fullName: { type: String, required: true, max: 500, min: 2},

        dateOfBirth: { type: Date, required: true },
        email: { type: String, required: true,  trim: true,
            validate: {
                validator: (value) => {
                    // Regular expression for a simple email validation
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return emailRegex.test(value);
                },
                message: 'Invalid email format',
            },
        },
        cellphoneContact: { type: String, required: true },
        gender: { type: String, required: true, enum: ['male', 'female']  },
        qualification: { type: String, required: true },
        profession: { type: String, required: true },
        expirienceInOilGas: { type: Boolean, default: false },
        yearsOfExperience: { type: Number },
        residencialAddress: { type: String, required: true },
        city: { type: String, required: true },
        currentEmployer: { type: String },
        nationality: { type: String, required: true },
        personalStatement: { type: String },
        curriculumVitae: { type: String }, // Assuming the CV is stored as a file path
        otherDocuments: { type: Array, default: [] }, // Assuming other documents are stored as file paths
        status: { type: String, enum: ['submitted','rejected', 'selected']},
    },
    { timestamps: true });

const Application = mongoose.model('Application', applicationSchema);
export default Application;
