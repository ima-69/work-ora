import axios from "axios";
import { AuthenticatedRequest } from "../middleware/auth.js";
import getBuffer from "../utils/buffer.js";
import { sql } from "../utils/db.js";
import ErrorHandler from "../utils/errorHandler.js";
import { TryCatch } from "../utils/TryCatch.js";

export const createCompany = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const user = req.user;

    if (!user) {
      throw new ErrorHandler(401, "Authenticated user required");
    }

    if (user.role !== "recruiter") {
      throw new ErrorHandler(
        403,
        "Forbidden:Only recruiters can create companies",
      );
    }

    const { name, description, website } = req.body;

    if (!name || !description || !website) {
      throw new ErrorHandler(
        400,
        "Please provide all required fields: name, description, website",
      );
    }

    const existingCompanies = await sql`
        SELECT company_id FROM companies WHERE name = ${name}
    `;

    if (existingCompanies.length > 0) {
      throw new ErrorHandler(409, `Company with this name: ${name} already exists`);
    }

    const file = req.file;

    if (!file) {
      throw new ErrorHandler(400, "Company logo file is required");
    }

    const fileBuffer = getBuffer(file);

    if (!fileBuffer || !fileBuffer.content) {
      throw new ErrorHandler(500, "Failed to generate buffer");
    }

    const {data} = await axios.post(`${process.env.UPLOAD_SERVICE_URL}/api/utils/upload`, {
      buffer: fileBuffer.content,
    });

    const [newCompany] = await sql`
        INSERT INTO companies (name, description, website, logo, logo_public_id, recruiter_id) VALUES 
        (${name}, ${description}, ${website}, ${data.url}, ${data.public_id}, ${req.user?.user_id}) RETURNING *
    `;

    res.json({
      message: "Company created successfully",
      company: newCompany,
    });
  },
);

export const deleteCompany = TryCatch(async (req: AuthenticatedRequest, res) => {
  const user = req.user;

  const { companyId } = req.params;

  const [company] = await sql`
    SELECT logo_public_id FROM companies WHERE company_id = ${companyId}
    AND recruiter_id = ${user?.user_id}
  `;

  if (!company) {
    throw new ErrorHandler(404, "Company not found or you do not have permission to delete it");
  }

  await sql`
    DELETE FROM companies WHERE company_id = ${companyId}
  `;

  res.json({
    message: "Company and all associated jobs have been deleted successfully",
  });
});
