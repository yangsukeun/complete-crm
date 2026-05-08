CREATE TYPE "Role" AS ENUM ('USER', 'TEAM_LEAD', 'EXECUTIVE', 'ADMIN');
CREATE TYPE "TaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'LATE');
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'HALF_AM', 'HALF_PM', 'QUARTER_AM', 'QUARTER_PM');
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'TEAM_LEAD_APPROVED', 'APPROVED', 'REJECTED');
CREATE TYPE "ScheduleInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "PaymentRequestStatus" AS ENUM ('PENDING', 'TEAM_LEAD_APPROVED', 'COMPLETED', 'REJECTED');
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'AWAITING_PAYMENT', 'PAYMENT_COMPLETED');
CREATE TYPE "AccessLogType" AS ENUM ('LOGIN');
CREATE TYPE "ActivityLogActionType" AS ENUM ('TASK_CREATED', 'TASK_COMPLETED', 'COMMENT_ADDED', 'SCHEDULE_CREATED', 'LOGIN', 'CHECK_IN', 'CHECK_OUT');
CREATE TYPE "DailyWorkLogStatus" AS ENUM ('DRAFT', 'SUBMITTED');
CREATE TYPE "NotificationType" AS ENUM ('DEADLINE', 'ASSIGNED', 'COMMENT', 'STAGNANT');
CREATE TYPE "WorkspaceScope" AS ENUM ('TEAM', 'PERSONAL');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "department" TEXT,
  "position" TEXT,
  "currentProjectId" TEXT,
  "joinDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "birthDate" TIMESTAMP(3),
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "phone" TEXT,
  "workPhone" TEXT,
  "workEmail" TEXT,
  "bankAccount" TEXT,
  "residentId" TEXT,
  "address" TEXT,
  "permissions" TEXT,
  "badgePreset" TEXT,
  "preferredAiProvider" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Brand" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Chat" (
  "id" TEXT NOT NULL,
  "isGroup" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vendor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "contactPerson" TEXT,
  "category" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotationForm" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "itemsJson" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuotationForm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Department" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Position" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyInfo" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "businessNumber" TEXT,
  "representative" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "fax" TEXT,
  "stampImageUrl" TEXT,
  "logoUrl" TEXT,
  "transferExecutorIds" TEXT,
  "annualLeaveMonthlyMaxUnderOneYear" INTEGER,
  "annualLeaveDaysAfterFirstFullYear" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyInfo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Project" ADD CONSTRAINT "Project_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Project_brandId_name_key" ON "Project"("brandId", "name");

CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoogleCalendarIntegration" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleCalendarIntegration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attendance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "checkIn" TIMESTAMP(3),
  "checkOut" TIMESTAMP(3),
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyMemo" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "DailyMemo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Schedule" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "isAllDay" BOOLEAN NOT NULL DEFAULT false,
  "userId" TEXT NOT NULL,
  "scope" "WorkspaceScope" NOT NULL DEFAULT 'TEAM',
  CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaveRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "LeaveType" NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaveBalance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "annualTotal" DOUBLE PRECISION NOT NULL DEFAULT 15,
  "annualUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "manualDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventDate" TIMESTAMP(3),
  "eventEndDate" TIMESTAMP(3),
  "location" TEXT,
  "pollData" TEXT,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BoardPost" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT DEFAULT '',
  "category" TEXT NOT NULL,
  "attachments" TEXT NOT NULL DEFAULT '[]',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoardPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT NOT NULL DEFAULT '',
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ipAddress" TEXT NOT NULL,
  "userAgent" TEXT NOT NULL,
  "loggedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "type" "AccessLogType" NOT NULL DEFAULT 'LOGIN',
  CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actionType" "ActivityLogActionType" NOT NULL,
  "targetTitle" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyWorkLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "status" "DailyWorkLogStatus" NOT NULL DEFAULT 'DRAFT',
  CONSTRAINT "DailyWorkLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isCollapsed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Quotation" (
  "id" TEXT NOT NULL,
  "quotationNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "totalAmount" INTEGER NOT NULL,
  "vatAmount" INTEGER NOT NULL,
  "finalAmount" INTEGER NOT NULL,
  "status" "QuotationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "issuedById" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD CONSTRAINT "User_currentProjectId_fkey" FOREIGN KEY ("currentProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoogleCalendarIntegration" ADD CONSTRAINT "GoogleCalendarIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyMemo" ADD CONSTRAINT "DailyMemo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardPost" ADD CONSTRAINT "BoardPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyWorkLog" ADD CONSTRAINT "DailyWorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskCategory" ADD CONSTRAINT "TaskCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaskCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

CREATE UNIQUE INDEX "GoogleCalendarIntegration_userId_key" ON "GoogleCalendarIntegration"("userId");

CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");

CREATE UNIQUE INDEX "DailyMemo_userId_date_key" ON "DailyMemo"("userId", "date");

CREATE UNIQUE INDEX "LeaveBalance_userId_year_key" ON "LeaveBalance"("userId", "year");

CREATE UNIQUE INDEX "DailyWorkLog_userId_date_key" ON "DailyWorkLog"("userId", "date");

CREATE UNIQUE INDEX "Quotation_quotationNumber_key" ON "Quotation"("quotationNumber");

CREATE INDEX "User_currentProjectId_idx" ON "User"("currentProjectId");

CREATE INDEX "Project_brandId_idx" ON "Project"("brandId");

CREATE INDEX "Attendance_userId_idx" ON "Attendance"("userId");

CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

CREATE INDEX "DailyMemo_userId_idx" ON "DailyMemo"("userId");

CREATE INDEX "Schedule_userId_idx" ON "Schedule"("userId");

CREATE INDEX "Schedule_startTime_idx" ON "Schedule"("startTime");

CREATE INDEX "Schedule_scope_idx" ON "Schedule"("scope");

CREATE INDEX "LeaveRequest_userId_idx" ON "LeaveRequest"("userId");

CREATE INDEX "LeaveRequest_startDate_idx" ON "LeaveRequest"("startDate");

CREATE INDEX "LeaveBalance_userId_idx" ON "LeaveBalance"("userId");

CREATE INDEX "Announcement_createdAt_idx" ON "Announcement"("createdAt");

CREATE INDEX "BoardPost_createdAt_idx" ON "BoardPost"("createdAt");

CREATE INDEX "BoardPost_category_idx" ON "BoardPost"("category");

CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE INDEX "AccessLog_userId_idx" ON "AccessLog"("userId");

CREATE INDEX "AccessLog_loggedInAt_idx" ON "AccessLog"("loggedInAt");

CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

CREATE INDEX "ActivityLog_timestamp_idx" ON "ActivityLog"("timestamp");

CREATE INDEX "DailyWorkLog_userId_idx" ON "DailyWorkLog"("userId");

CREATE INDEX "DailyWorkLog_date_idx" ON "DailyWorkLog"("date");

CREATE INDEX "TaskCategory_parentId_idx" ON "TaskCategory"("parentId");

CREATE INDEX "Quotation_issuedById_idx" ON "Quotation"("issuedById");

CREATE INDEX "Quotation_quotationNumber_idx" ON "Quotation"("quotationNumber");

CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");

CREATE TABLE "ScheduleInvite" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "status" "ScheduleInviteStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduleInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "parentId" TEXT,
  "categoryId" TEXT,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "isCollapsed" BOOLEAN NOT NULL DEFAULT false,
  "scope" "WorkspaceScope" NOT NULL DEFAULT 'TEAM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "assignedToId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskLink" (
  "id" TEXT NOT NULL,
  "parentId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskAttachment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskComment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatParticipant" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotationItem" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentRequest" (
  "id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" "PaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "description" TEXT,
  "attachment" TEXT,
  "requesterId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "quotationId" TEXT,
  CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentRequestAlert" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRequestAlert_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScheduleInvite" ADD CONSTRAINT "ScheduleInvite_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleInvite" ADD CONSTRAINT "ScheduleInvite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleInvite" ADD CONSTRAINT "ScheduleInvite_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentRequestAlert" ADD CONSTRAINT "PaymentRequestAlert_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentRequestAlert" ADD CONSTRAINT "PaymentRequestAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ScheduleInvite_scheduleId_toUserId_key" ON "ScheduleInvite"("scheduleId", "toUserId");

CREATE UNIQUE INDEX "TaskLink_parentId_childId_key" ON "TaskLink"("parentId", "childId");

CREATE UNIQUE INDEX "ChatParticipant_chatId_userId_key" ON "ChatParticipant"("chatId", "userId");

CREATE UNIQUE INDEX "PaymentRequestAlert_requestId_userId_key" ON "PaymentRequestAlert"("requestId", "userId");

CREATE INDEX "ScheduleInvite_toUserId_idx" ON "ScheduleInvite"("toUserId");

CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");

CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

CREATE INDEX "Task_categoryId_idx" ON "Task"("categoryId");

CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

CREATE INDEX "Task_scope_idx" ON "Task"("scope");

CREATE INDEX "TaskLink_parentId_idx" ON "TaskLink"("parentId");

CREATE INDEX "TaskLink_childId_idx" ON "TaskLink"("childId");

CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

CREATE INDEX "ChatParticipant_userId_idx" ON "ChatParticipant"("userId");

CREATE INDEX "ChatMessage_chatId_idx" ON "ChatMessage"("chatId");

CREATE INDEX "ChatMessage_userId_idx" ON "ChatMessage"("userId");

CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

CREATE INDEX "PaymentRequest_requesterId_idx" ON "PaymentRequest"("requesterId");

CREATE INDEX "PaymentRequest_vendorId_idx" ON "PaymentRequest"("vendorId");

CREATE INDEX "PaymentRequest_status_idx" ON "PaymentRequest"("status");

CREATE INDEX "PaymentRequest_requestedAt_idx" ON "PaymentRequest"("requestedAt");

CREATE INDEX "PaymentRequest_quotationId_idx" ON "PaymentRequest"("quotationId");

CREATE INDEX "PaymentRequestAlert_userId_idx" ON "PaymentRequestAlert"("userId");
