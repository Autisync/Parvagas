import Application from '../models/application'; // Adjust the path based on your project structure

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
      status,
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
      status,
    });// Store the req into a Application object

    // Save the application to the database
    const savedApplication = await newApplication.save();
    // Send status code that application has been created
    res.status(201).json({ application: savedApplication, message: 'Application submitted successfully' });
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId, status } = req.body; // Retrieve application ID and status from req body

    // Find the application by ID in the database
    const existingApplication = await Application.findById(applicationId);

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

  export const getApplication = async (req, res) => {
    try {
      const { applicationId } = req.params; // Retrieve application ID from request parameters
  
      // Find the application by ID in the database
      const application = await Application.findById(applicationId);
  
      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }
  
      res.json({ application });
    } catch (error) {
      console.error('Error retrieving application:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };
