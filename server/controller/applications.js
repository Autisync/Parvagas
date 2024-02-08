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
      progress,
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
      progress,
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

