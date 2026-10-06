-- AlterEnum
ALTER TYPE "LearningActivityType" ADD VALUE 'TOEIC_EXAM';

-- CreateEnum
CREATE TYPE "ToeicPart" AS ENUM ('PART_1', 'PART_2', 'PART_3', 'PART_4', 'PART_5', 'PART_6', 'PART_7');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('FULL_TEST', 'MINI_TEST', 'PRACTICE_PART');

-- CreateTable
CREATE TABLE "ToeicExam" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "series" TEXT NOT NULL DEFAULT 'ETS',
    "year" INTEGER NOT NULL,
    "testNumber" INTEGER NOT NULL DEFAULT 1,
    "type" "ExamType" NOT NULL DEFAULT 'FULL_TEST',
    "duration" INTEGER NOT NULL DEFAULT 120,
    "totalQuestions" INTEGER NOT NULL DEFAULT 200,
    "audioFullUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "difficulty" TEXT DEFAULT 'INTERMEDIATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToeicExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToeicPassage" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "part" "ToeicPart" NOT NULL,
    "passageNumber" INTEGER,
    "title" TEXT,
    "content" TEXT,
    "audioUrl" TEXT,
    "imageUrl" TEXT,
    "transcript" TEXT,
    "translation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToeicPassage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToeicQuestion" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "passageId" TEXT,
    "part" "ToeicPart" NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "questionText" TEXT,
    "imageUrl" TEXT,
    "audioUrl" TEXT,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "transcript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToeicQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToeicExamAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "listeningCorrect" INTEGER NOT NULL DEFAULT 0,
    "readingCorrect" INTEGER NOT NULL DEFAULT 0,
    "scoreListening" INTEGER NOT NULL DEFAULT 0,
    "scoreReading" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "timeSpent" INTEGER NOT NULL DEFAULT 0,
    "targetPart" "ToeicPart",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToeicExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToeicUserAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedAnswer" TEXT,
    "correctAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToeicUserAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToeicScoreConversion" (
    "id" TEXT NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "listeningScore" INTEGER NOT NULL,
    "readingScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToeicScoreConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToeicExam_slug_key" ON "ToeicExam"("slug");

-- CreateIndex
CREATE INDEX "ToeicExam_year_idx" ON "ToeicExam"("year");

-- CreateIndex
CREATE INDEX "ToeicExam_series_idx" ON "ToeicExam"("series");

-- CreateIndex
CREATE INDEX "ToeicExam_type_idx" ON "ToeicExam"("type");

-- CreateIndex
CREATE INDEX "ToeicExam_isPublished_idx" ON "ToeicExam"("isPublished");

-- CreateIndex
CREATE INDEX "ToeicPassage_examId_idx" ON "ToeicPassage"("examId");

-- CreateIndex
CREATE INDEX "ToeicPassage_part_idx" ON "ToeicPassage"("part");

-- CreateIndex
CREATE INDEX "ToeicQuestion_examId_idx" ON "ToeicQuestion"("examId");

-- CreateIndex
CREATE INDEX "ToeicQuestion_part_idx" ON "ToeicQuestion"("part");

-- CreateIndex
CREATE INDEX "ToeicQuestion_passageId_idx" ON "ToeicQuestion"("passageId");

-- CreateIndex
CREATE INDEX "ToeicQuestion_questionNumber_idx" ON "ToeicQuestion"("questionNumber");

-- CreateIndex
CREATE INDEX "ToeicExamAttempt_userId_idx" ON "ToeicExamAttempt"("userId");

-- CreateIndex
CREATE INDEX "ToeicExamAttempt_examId_idx" ON "ToeicExamAttempt"("examId");

-- CreateIndex
CREATE INDEX "ToeicExamAttempt_userId_completedAt_idx" ON "ToeicExamAttempt"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "ToeicUserAnswer_attemptId_idx" ON "ToeicUserAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "ToeicUserAnswer_questionId_idx" ON "ToeicUserAnswer"("questionId");

-- CreateIndex
CREATE INDEX "ToeicUserAnswer_isCorrect_idx" ON "ToeicUserAnswer"("isCorrect");

-- CreateIndex
CREATE UNIQUE INDEX "ToeicScoreConversion_correctCount_key" ON "ToeicScoreConversion"("correctCount");

-- AddForeignKey
ALTER TABLE "ToeicPassage" ADD CONSTRAINT "ToeicPassage_examId_fkey" FOREIGN KEY ("examId") REFERENCES "ToeicExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToeicQuestion" ADD CONSTRAINT "ToeicQuestion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "ToeicExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToeicQuestion" ADD CONSTRAINT "ToeicQuestion_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "ToeicPassage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToeicExamAttempt" ADD CONSTRAINT "ToeicExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToeicExamAttempt" ADD CONSTRAINT "ToeicExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "ToeicExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToeicUserAnswer" ADD CONSTRAINT "ToeicUserAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ToeicExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToeicUserAnswer" ADD CONSTRAINT "ToeicUserAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ToeicQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
