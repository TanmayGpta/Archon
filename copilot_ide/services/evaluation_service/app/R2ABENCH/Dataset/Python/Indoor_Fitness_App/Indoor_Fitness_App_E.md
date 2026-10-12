# Introduction

This project is an intelligent indoor sports application that integrates professional posture assessment, scientific exercise motivation, and fun social sharing. By leveraging pose estimation technology from computer vision, the software transforms a mobile device camera into a "virtual personal trainer". It aims to resolve the core pain points of limited workout time and venue selection for amateur sports enthusiasts (such as students and office workers) and professional fitness coaches. By providing real-time movement correction, physical status monitoring, and personalized exercise reports across various fragmented scenarios like homes and offices, the system ensures users receive scientific, standardized, and engaging fitness guidance even without a professional coach present.

# Core Objectives

* Implement high-precision real-time human pose monitoring and skeleton extraction to provide movement standardization scores.
* Dynamically formulate and adjust scientific training plans based on the user's physical condition, constraints, and real-time exercise feedback.
* Generate professional exercise reports and training posters through visual data charts to enhance motivation and social sharing.
* Support multi-device collaboration through a screen-casting function to optimize the user's visual observation experience during exercise.
* Provide 24/7, location-independent fitness guidance services to meet the demands of fragmented exercise schedules.
* Ensure high software usability, aiming for a final user satisfaction rate of over 90%.

# Functional Features

### Professional Assessment Module

* When a user starts recording an exercise video, the terminal device extracts skeleton information in real-time and compares it with standard movements for scoring.
* While exercise is in progress, the system monitors real-time movement data and evaluates actual completion based on physical health standards.
* When a user views the real-time feed on a mobile device, the system displays assessment results via a posture stick figure and shows the remaining time for the movement.

### Intelligent Recommendation Module

* When a user first uses the app or updates their status, the system formulates a training plan by synthesizing user goals, physical conditions, and constraints.
* When a user is in the middle of a real-time group training session, the system automatically adjusts and pushes the next exercise or rest plan based on real-time fatigue or completion status.
* When a user completes the professional assessment module, the system provides targeted advanced plan recommendations on the workout summary interface.

### Fun Sharing Module

* When a user completes at least one training session, the system generates shareable training posters based on posture data, images, and plan information.
* When a summary is required after training, the system uses visualization methods to generate exercise reports containing professional statistical data and text explanations.

### Screen-Casting Module

* When a user clicks the screen-casting function within a local area network (LAN), the system automatically searches for and connects to Android large-screen devices on the same network.
* When the connection is successful, the system mirrors the real-time exercise interface and assessment results from the mobile phone to the target device.

# Technical Constraints

1. **Mobile Platforms**: Supports Android 8.0 or iOS 11.0 and above.
2. **Programming Language**: Python is used for backend development.
3. **Hardware Constraints**:
    * **Mobile Devices**: Require an octa-core 2.45GHz CPU, at least 4GB RAM, and 32GB ROM.
    * **Servers**: Require a Pentium 900M (Pentium 4 1.2G recommended) processor and at least 256M RAM.
    * **Capture Devices**: The user's mobile phone must support video recording at 30fps or higher.

# Non-Functional Requirements

* **Performance**: The pose estimation model must achieve a running speed of over 20fps; plan recommendations must be generated within 1s; exercise reports must be generated within 3s; screen-casting video stream latency must be under 100ms, with command response latency under 50ms.
* **Security**: Must feature data leak protection (controlling clipboard, screenshots, and memory theft); implement strict user identity verification and access control (distinguishing between administrators and general users); and include mechanisms to prevent SQL injection through prepared statements and variable binding.
* **Availability**: Pose recognition accuracy must exceed 95% under normal lighting and unobstructed conditions; in scenarios with partial occlusion, accuracy for unobstructed parts must remain above 90%.
* **Flexibility/Scalability**: Uses a modular design philosophy where modules exchange data via interfaces to facilitate future functional expansion and maintenance.
* **Portability**: Based on modular design, the system supports the migration and integration of functional modules across different environments.

# System Architecture Description

### 1. Infrastructure Layer

This layer serves as the underlying support for the system, primarily responsible for scheduling fundamental hardware resources and distributing computational power for core algorithms. It encapsulates physical details such as mobile camera capture, cross-device LAN communication, and large-scale data storage (static standard libraries and dynamic user libraries). In terms of computational capability, it provides the underlying visual engine for human keypoint detection and skeleton extraction, transforming raw video streams into structured vector data suitable for computation. This shields upper-layer applications from complex low-level perception and network transmission protocols.

### 2. Support Layer

This layer transforms the raw data from the infrastructure layer into business support with movement semantics through a series of highly cohesive service modules. Its core responsibilities include:

*   **Evaluation and Computing Services**: Executes pose similarity comparison, utilizes algorithms to eliminate user body shape differences, and converts skeleton vectors into standardized movement scores.
*   **Analysis and Generation Services**: Aggregates movement logs, supports data visualization rendering, and handles asynchronous generation of multimedia posters.
*   **Communication Middleware**: Manages streaming media synchronization and command responses for screen mirroring, ensuring low-latency data exchange.
This layer provides the application layer with a set of stable motion analysis primitives through an interfaced approach.

### 3. Application Layer

This layer focuses on the logical orchestration of specific business scenarios and represents the final interface for system-user interaction. Based on the user's exercise goals and real-time physical condition, it drives the **intelligent recommendation logic** to dynamically adjust training plans. It is also responsible for managing specific business flows such as **exercise monitoring, report presentation, and social sharing**. The application layer does not need to concern itself with how pose estimation is achieved through visual algorithms; it simply invokes the evaluation results from the support layer to complete the business closed loop of "movement guidance" and "progress feedback," thereby achieving complete decoupling between business logic and underlying technology.