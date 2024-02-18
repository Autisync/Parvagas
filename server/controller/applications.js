import Application from '../models/application.js'; // Adjust the path based on your project structure
import {login, register} from "./auth.js";

export const createApplication = async (req, res) => {
  try {
    const {
      jobId,
      fullName,
      dateOfBirth,
      email,
      cellphoneContact,
      gender,
      qualification,
      profession,
      expirienceInOilGas,
      yearsOfExperience,
      residencialAddress,
      city,
      currentEmployer,
      nationality,
      personalStatement,
      curriculumVitae,
      otherDocuments,
    } = req.body; // Retreave application fields data from req body

    const newApplication = new Application({
      jobId,
      fullName,
      dateOfBirth,
      email,
      cellphoneContact,
      gender,
      qualification,
      profession,
      expirienceInOilGas,
      yearsOfExperience,
      residencialAddress,
      city,
      currentEmployer,
      nationality,
      personalStatement,
      curriculumVitae,
      otherDocuments,
      status: "submitted",
    });// Store the req into a Application object

    // Create an account
    const isUserCreated = register(req,res);
    if(!isUserCreated) return;
    // Save the application to the database
    const savedApplication = await newApplication.save();
    // Send status code that application has been created
    res.status(201).json({ application: savedApplication, message: 'Application submitted successfully' });
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ error: '<Mmauro>' });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const { id, status } = req.body; // Retrieve application ID and status from req body

    // Find the application by ID in the database
    const existingApplication = await Application.findById(id);

    if (!existingApplication) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Update the status field
    existingApplication.status = status;

    // Save the updated application to the database
    const updatedApplication = await existingApplication.save();

    res.json({ application: updatedApplication, message: 'Application status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// GET ALL APPLICATIONS
export const getApplications = async (req, res) => {
    try {
      // Retrieve all applications from the database
      const applications = await Application.find();
  
      res.json({ applications });
    } catch (error) {
      console.error('Error retrieving applications:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };

//   GET A SINGLE APPLICATION
export const getApplication = async (req, res) => {
    try {
      const { id } = req.params; // Retrieve application ID from request parameters
  
      // Find the application by ID in the database
      const application = await Application.findById(id);
  
      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }
  
      res.json({ application });
    } catch (error) {
      console.error('Error retrieving application:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };

//   DELETE A SINGLE APPILCATION

export const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params; // Retrieve application ID from request parameters

    // Find and remove the application by ID from the database
    const deletedApplication = await Application.findByIdAndRemove(id);

    if (!deletedApplication) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ message: 'Application deleted successfully', application: deletedApplication });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
