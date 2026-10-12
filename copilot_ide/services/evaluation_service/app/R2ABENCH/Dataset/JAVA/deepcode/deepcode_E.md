# Introduction
**DeepCode** is a comprehensive algorithm learning and Online Judge (OJ) platform empowered by Large Language Models (LLMs), integrating learning, practice, community interaction, and AI-assisted features. Designed to serve students, algorithm enthusiasts, and programmers, the application addresses core pain points such as the difficulty of improving programming skills, shallow understanding of algorithmic logic, and a lack of deep social interaction. By providing an extensive problem bank, a secure code execution sandbox, and a peer-help community, DeepCode leverages LLM integration to achieve intelligent functions like AI-driven problem recommendations, code explanation, and in-depth analysis, ensuring that technology empowers every stage of algorithmic implementation.

# Core Objectives
+ **Enhance Programming and Algorithmic Thinking:** Provide a superior learning and practice environment to deepen understanding of data structures through a diverse problem set and detailed solutions.
+ **Build a Secure Evaluation Environment:** Develop a secure judging sandbox capable of resisting malicious code attacks to ensure the safety and reliability of the evaluation engine.
+ **Facilitate Community Knowledge Accumulation:** Establish discussion forums to support the sharing of insights and the collision of ideas, fostering collective progress among users.
+ **Enable AI Intelligent Empowerment:** Utilize LLMs to assist in problem recommendation, logical analysis, and code reviews, thereby improving learning efficiency.
+ **Ensure High Performance and Usability:** Provide an intuitive user interface and support high-concurrency access to ensure stable output in digital learning scenarios.

# Functional Features
### 1. User and Permission Management
+ **When** a guest clicks the registration button on the login page and submits their details, the system performs information validation and creates a new user account.
+ **When** a registered user or administrator enters valid credentials and clicks login, the system performs identity authentication and grants access permissions.
+ **When** a logged-in user enters their personal homepage or clicks refresh, the system queries and displays their basic profile and activity status (e.g., problem completion stats, comments).
+ **When** a registered user submits modified personal information, the system performs a data update and returns a success result.
+ **When** an administrator selects a target user in the management module and sets an operation (ban, unban, or grant permissions), the system updates that user’s status and privileges.

### 2. Problem Bank and Code Evaluation
+ **When** a user clicks on a specific problem, the system displays the problem title, description, difficulty level, and a list of related solutions.
+ **When** a logged-in user clicks on a specific solution, the system displays the detailed problem-solving logic and content.
+ **When** a logged-in user triggers a code submission, the system sends the code to the evaluation server for testing and records the evaluation result.
+ **When** a user clicks to refresh submission records, the system retrieves and displays the user’s historical evaluation data for a specific problem from the database.
+ **When** an authorized user submits a new problem or edits existing problems/solutions, the system updates the content in either the pending review queue or the official problem bank.
+ **When** a user with deletion privileges executes a delete command, the system removes the problem and associated data using a "soft delete" method (applying a hidden tag).

### 3. Forum Interaction
+ **When** a user enters the list page or clicks a specific post, the system requests and displays the post body, images, attachments, and the comment list.
+ **When** a logged-in user fills in content and clicks publish, the system validates the data format and image size (5MB limit) before storing the post in the database.
+ **When** a user submits a comment on a post or interacts via likes/reports, the system updates interaction data in real-time and records the logs.
+ **When** an authorized user (author or administrator) clicks to delete a post or comment, the system removes the item along with all associated sub-replies or attachments.

### 4. AI Interaction Assistance
+ **When** a user clicks "AI Recommendation" on the problem list page, the system generates targeted recommendations based on the user’s recent behavior (requiring at least 5 completed problems).
+ **When** a user triggers an AI function on the problem details or submission records page, the system calls the LLM API to provide problem analysis or code explanations.
+ **When** an administrator clicks "AI Assistance" in the audit interface, the system utilizes AI to generate review suggestions to assist in manual decision-making.

# Technical Constraints
+ **Client Platforms:** Must support mainstream Web browsers (Edge, Chrome, Safari, etc.).
+ **Backend Framework:****Spring Boot** (Version 3.1.2).
+ **Database & Caching:****MySQL** (Version 5.7.44) for storage; **Redis** (Version 7.4.6) for caching.
+ **Programming Languages:****JavaScript** with **Vue** framework (Frontend); **Java** with **JDK 21** (Backend); **Python** (Algorithm support modules).

# Non-Functional Requirements
### 1. Processing Efficiency
+ Page transitions must be completed within **5 seconds**.
+ Response time for precise searches should be controlled within **3 seconds**.
+ The system must support at least **200 concurrent users**, with response times not exceeding **5 seconds** under peak load.

### 2. Security
+ Implement isolation between the frontend and core problem data.
+ Establish a **sandbox environment** for evaluation programs and implement malicious code detection.
+ Provide IP blacklisting and high-frequency access restrictions (rate limiting).

### 3. Availability
+ Ensure that critical data (e.g., submission records) is not lost during hardware or software failures.
+ Implement automatic restart, self-check, and data recovery procedures following server hardware failure.
+ Perform daily data backups and conduct recovery drills every month.

### 4. Flexibility
+ Adopt a **modular design** where subsystems (User, Problem, Forum, etc.) are developed and debugged independently to facilitate upgrades and maintenance.
+ Configure a comprehensive logging system for troubleshooting.

### 5. Portability
+ The system must support operation on Windows, Linux, and other mainstream operating systems.

# System Architecture Description

### 1. Infrastructure Layer

As the topmost layer of the system, this layer focuses on the implementation of specific business scenarios and the orchestration of user interaction logic. It shields the underlying technical details and concentrates on handling the core business processes of the user system, question bank system, forum system, and AI assistant system. At this layer, the system is responsible for receiving user requests such as registration, question submission, post publishing, and AI Q&A, and schedules and responds to these requests according to business rules (e.g., permission verification, process navigation). It does not directly handle the physical storage of data or the low-level execution of code; instead, it achieves specific business goals by invoking lower-layer services, realizing the separation of business logic from technical implementation.

### 2. Support Layer

This layer supports upper-layer businesses by providing a highly cohesive set of common services. Its core responsibilities include two aspects: first, building a secure code evaluation sandbox environment, which acts as a logical "virtual machine" to isolate and execute user-submitted code, defend against malicious attacks, and ensure the security and reliability of evaluations; second, serving as an integration and adaptation bridge, encapsulating interface interactions with external Large Language Models (LLM), while providing common services such as caching mechanisms (e.g., lazy loading supported by Redis), session management, exception handling, and logging. This layer shields the upper layers from complex hardware and external interface differences, and provides unified, standard functional invocation services.

### 3. Application Layer
Located at the bottom of the architecture, this layer is responsible for providing the computing, communication, and data storage infrastructure required for system operation, independent of specific business logic. It includes physical or virtualized server resources, operating system environments, and database management systems (MySQL). The core responsibility of this layer is to ensure the persistent storage of data (including the implementation of physical models such as user data, question metadata, and submission records) and to provide stable network communication protocols to support data transmission between layers. It provides the underlying computing capabilities and data access interfaces for the support layer, serving as the physical foundation for the stable operation of the entire system.