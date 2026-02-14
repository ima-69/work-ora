import express from "express";
import { isAuth } from "../middleware/auth.js";
import uploadFile from "../middleware/multer.js";
import { createCompany, createJob, deleteCompany, getAllActiveJobs, getAllCompanies, getCompanyById, updateJob } from "../controllers/job.js";

const router = express.Router();

router.post("/company/new", isAuth, uploadFile, createCompany);
router.delete("/company/:companyId", isAuth, deleteCompany);
router.post("/new", isAuth, createJob);
router.put("/:jobId", isAuth, updateJob);
router.get("/company/all", isAuth, getAllCompanies);
router.get("/company/:id", isAuth, getCompanyById);
router.get("/all", isAuth, getAllActiveJobs);

export default router;