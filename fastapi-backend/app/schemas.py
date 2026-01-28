from typing import Union
from pydantic import BaseModel, EmailStr, Field


class ExperienceItem(BaseModel):
    company: str = ""
    title: str = ""
    start: str = ""
    end: str = ""
    location: str = ""
    highlights: list[str] = Field(default_factory=list)


class EducationItem(BaseModel):
    school: str = ""
    degree: str = ""
    start: str = ""
    end: str = ""
    location: str = ""


class ProjectItem(BaseModel):
    name: str = ""
    description: str = ""
    highlights: list[str] = Field(default_factory=list)


class CertificationItem(BaseModel):
    name: str = ""
    issuer: str = ""
    date: str = ""


class RelevantSkillItem(BaseModel):
    skill: str = ""
    years_required: str = ""
    years_hands_on: str = ""


class ResumeStructured(BaseModel):
    name: str = ""
    email: Union[EmailStr, str] = ""
    phone: str = ""
    location: str = ""
    title: str = ""
    summary: str = ""
    willing_to_relocate: str = ""
    former_tcs_employee_or_contractor: str = ""
    interview_availability: str = ""
    interview_timezone: str = ""
    links: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    relevant_skills: list[RelevantSkillItem] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    certifications: list[CertificationItem] = Field(default_factory=list)
