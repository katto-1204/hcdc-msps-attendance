CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`attendanceDate` varchar(10) NOT NULL,
	`session` enum('morning_in','morning_out','afternoon_in','afternoon_out') NOT NULL,
	`recordedAt` timestamp NOT NULL,
	`recordedBy` int,
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_date_session` UNIQUE(`studentId`,`attendanceDate`,`session`)
);
--> statement-breakpoint
CREATE TABLE `importBatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`studentsFound` int NOT NULL DEFAULT 0,
	`successfullyImported` int NOT NULL DEFAULT 0,
	`duplicates` int NOT NULL DEFAULT 0,
	`invalidRecords` int NOT NULL DEFAULT 0,
	`status` enum('completed','review') NOT NULL DEFAULT 'completed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `importBatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` varchar(32) NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`yearLevel` int NOT NULL,
	`barcode` varchar(64),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_studentId_unique` UNIQUE(`studentId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(255);