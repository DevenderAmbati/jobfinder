You are a Senior Software Architect and Staff Engineer.

Your task is to build a production-quality personal Job Intelligence Platform, not just a job scraper.

The primary objective is:

"Never let me miss a relevant software engineering job."

The application continuously monitors company career portals, detects newly posted jobs, intelligently evaluates whether they match my profile, and instantly notifies me via Telegram.

This project should demonstrate senior-level backend architecture, clean code, modularity, scalability, AI integration, and excellent software engineering practices. It should be portfolio-quality.

==========================
TECH STACK
==========================

Frontend
- React
- TypeScript
- Vite
- TailwindCSS
- React Router
- TanStack Query

Backend
- Node.js
- Express.js
- TypeScript

Database
- SQLite
- Prisma ORM

Scheduler
- node-cron

Scraping
- Axios
- Cheerio
- Playwright

Notifications
- Telegram Bot API

AI
- Google Gemini API (Free Tier)

Deployment
- GitHub
- GitHub Actions
- Local Development

Everything must be completely free.

Do NOT use Redis, BullMQ, Kubernetes, Docker, RabbitMQ, Kafka or PostgreSQL in Version 1.

Keep the architecture simple but highly extensible.

==========================
ARCHITECTURE
==========================

Use Clean Architecture.

Follow SOLID principles.

Use dependency injection where appropriate.

Use Repository Pattern.

Use Service Layer.

Use Adapter Pattern.

No business logic inside controllers.

Separate concerns completely.

The project structure should be modular.

Example

src/

api/

controllers/

routes/

providers/

workday/

greenhouse/

lever/

microsoft/

successfactors/

oracle/

services/

scheduler/

database/

repositories/

notifications/

telegram/

ai/

rules/

models/

utils/

config/

==========================
PROVIDER ARCHITECTURE
==========================

Never build company-specific scrapers.

Instead implement Provider Adapters.

Example

interface JobProvider {

fetchJobs(): Promise<Job[]>

}

Implement

GreenhouseProvider

LeverProvider

WorkdayProvider

MicrosoftProvider

SuccessFactorsProvider

OracleProvider

CustomProvider

Each provider converts its own response into one common Job model.

Job Model

id

company

title

location

description

experience

skills

salary

postedDate

applyUrl

provider

==========================
COMPANY REGISTRY
==========================

Never hardcode companies.

Store companies inside the database.

Fields

name

provider

careerUrl

enabled

frequency

lastRun

Adding a new company should require only a database entry.

No code changes.

==========================
SCHEDULER
==========================

Use node-cron.

Every enabled company runs independently.

Each company has

lastRun

status

frequency

If one provider fails

others continue.

==========================
JOB NORMALIZATION
==========================

Different providers return different formats.

Normalize every job into one Job object.

==========================
DUPLICATE DETECTION
==========================

Generate SHA256 hash using

company

title

location

Ignore duplicates.

==========================
RULE ENGINE
==========================

Never use simple keyword matching.

Build a configurable Rule Engine.

Rules include

Countries

Cities

Experience

Skills

Role

Excluded Roles

Minimum AI Score

Companies

Everything configurable.

==========================
AI MATCHING
==========================

Store my resume once.

For every new job

Send Resume

+

Job Description

to Gemini.

Prompt

"You are an experienced engineering recruiter.

Compare this resume with this job description.

Return JSON

Match Score

Reasons

Missing Skills

Interview Difficulty

Salary Estimate

Recommendation

Apply or Skip."

Store result.

==========================
NOTIFICATIONS
==========================

Telegram only in Version 1.

Notify only if

Match Score >= 80

Notification Example

🚀 New Job Found

Company

Microsoft

Role

Software Engineer II

Location

Hyderabad

Salary

35-42 LPA

Match Score

93%

Why it matches

✔ React

✔ Node

✔ Kubernetes

✔ Azure

Missing

Redis

Kafka

Apply

<URL>

==========================
DASHBOARD
==========================

Create a React dashboard.

Pages

Dashboard

Companies

Jobs

Rules

Applications

Logs

Settings

Dashboard widgets

Companies monitored

Jobs checked today

Matched jobs

Notifications sent

Applied

Ignored

==========================
APPLICATION TRACKER
==========================

Track

Saved

Applied

Interview

Rejected

Offer

Joined

==========================
DATABASE
==========================

Company

Job

Rule

Resume

Application

NotificationLog

ProviderLog

==========================
ERROR HANDLING
==========================

Retry failed providers.

Log every failure.

Never crash scheduler.

==========================
LOGGING
==========================

Log

Start Time

End Time

Provider

Jobs Found

Jobs Added

Time Taken

Errors

==========================
CONFIGURATION
==========================

Everything configurable.

Telegram Token

Gemini Key

Cron Frequency

Rule Threshold

Companies

Never hardcode values.

Use environment variables.

==========================
VERSION 1 FEATURES
==========================

Greenhouse Provider

Lever Provider

Workday Provider

Microsoft Provider

Telegram Notifications

Gemini AI Matching

Dashboard

Company Management

Rule Engine

Application Tracker

SQLite

Prisma

==========================
VERSION 2
==========================

Email Notifications

Push Notifications

Resume Tailoring

Cover Letter Generator

Interview Preparation

Referral Tracker

Daily Digest

==========================
CODING STANDARDS
==========================

Use strict TypeScript.

No "any".

Proper interfaces.

Reusable components.

Reusable services.

Reusable providers.

Meaningful naming.

Comprehensive comments.

Error boundaries.

Centralized error handling.

Write maintainable code.

==========================
GOAL
==========================

The final application should feel like a polished SaaS product built by an experienced engineer.

It should be easy to add new ATS providers without changing existing code.

It should be easy to monitor hundreds of companies.

It should be fast, modular, scalable, clean, and production-ready.

Before writing any code:

1. Design the complete folder structure.
2. Design the database schema.
3. Design provider interfaces.
4. Design API contracts.
5. Design React pages.
6. Design the scheduler.
7. Explain the architecture.

Only then begin implementation.

Implement one feature at a time with small, reviewable commits.