-- CreateTable
CREATE TABLE "idle_sessions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "idleStart" TIMESTAMP(3) NOT NULL,
    "idleEnd" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idle_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdleSession_employeeId_idleStart_idx" ON "idle_sessions"("employeeId", "idleStart");

-- CreateTable
CREATE TABLE "device_status" (
    "deviceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isIdle" BOOLEAN NOT NULL DEFAULT false,
    "clientVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_status_pkey" PRIMARY KEY ("deviceId")
);

-- CreateIndex
CREATE INDEX "DeviceStatus_employeeId_idx" ON "device_status"("employeeId");
