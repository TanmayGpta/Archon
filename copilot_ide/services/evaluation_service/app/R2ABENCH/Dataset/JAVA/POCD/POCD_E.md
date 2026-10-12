# Introduction
The **Persistent Object Inconsistency Detection Software (POCD)** is an automated detection and repair tool designed to solve the synchronization failure between models and database structures during software development. Targeted primarily at R&D, testing, and IT operations professionals with strong technical backgrounds, POCD addresses core pain points such as performance degradation, difficulty in requirement tracking, and project acceptance risks caused by inconsistencies between code class diagrams and database schemas during business iterations. By automatically parsing database scripts and UML class diagrams, POCD accurately identifies conflicts in fields, types, and relationships between classes, providing visualized repair suggestions to reduce the manual maintenance burden on developers and enhance system data consistency and stability.

# Core Objectives
+ **Automated Parsing and Visualization:** Implement deep parsing and visual display of key information from database design files (MySQL) and class diagram storage files (StarUML).
+ **Comprehensive Conflict Detection:** Accurately detect inconsistencies between classes and tables, attributes and columns, field names, data types, and inter-class multiplicities or relationship types.
+ **Closed-loop Repair Mechanism:** Generate repair suggestions based on detection results and automatically execute updates to the database or class diagrams upon user authorization.
+ **Flexible Rule Configuration:** Allow users to customize detection parameters, configure detection algorithms, and set specific exception rules.
+ **Historical Traceability and Management:** Provide file upload/download functions and persistently store historical detection records and modification logs for traceability.
+ **Lowering the Barrier to Entry:** Enhance the experience for novice users by providing tutorials, help manuals, and detection case studies.

# Functional Features
### 1. Account and Permission Module
+ **When** an unregistered user needs to join the system, the user performs the action of entering personal information and submitting the registration.
+ **When** a registered user needs to access system functions, the user performs the actions of entering account credentials and executing the login.

### 2. File and Resource Management
+ **When** a logged-in user needs to analyze data, the user performs the action of uploading class diagram (`.mdj`) or database (`.sql`) files.
+ **When** a logged-in user needs to organize files, the user performs the actions of modifying file names or executing file deletions.
+ **When** a logged-in user needs to export materials, the user performs the actions of downloading class diagrams, database files, or detection reports.
+ **When** a user needs to learn how to use the system, the user performs the actions of querying the help manual or downloading detection cases.

### 3. Parsing and Extraction Module
+ **When** the system receives a class diagram file, the class diagram parser performs the actions of extracting class, attribute, and relationship information.
+ **When** the system receives a database file, the database parser performs the actions of extracting table names, fields, primary keys, foreign keys, and trigger information via JDBC.
+ **When** the system scans the database structure, the business logic layer performs the action of identifying the relationship types implied by foreign keys and triggers.

### 4. Inconsistency Detection Module
+ **When** a user initiates a detection task, the system performs the action of one-to-one matching between entity classes and entity tables using a bipartite matching algorithm.
+ **When** entity matching is complete, the system performs the action of detecting field inconsistencies between class/table names and attribute/column names.
+ **When** attribute correspondences are established, the system performs the action of comparing the compatibility between attribute data types and database column types.
+ **When** executing a deep detection, the system performs the action of detecting conflicts in multiplicity upper/lower bounds and relationship types (Aggregation, Composition, Inheritance).

### 5. Repair and Traceability Module
+ **When** an inconsistency is detected, the system performs the actions of generating repair suggestions and presenting them for user selection.
+ **When** the user confirms the repair command, the system performs the action of automatically repairing the class diagram or database following the correct topological order.
+ **When** a user needs to review changes, the system performs the action of displaying historical inconsistency detection information and modification records.

# Technical Constraints
+ **Mobile Platforms:** Support for Android and iOS is required (specifically for Gemini Live auxiliary features).
+ **Backend Framework:** Utilizes the **Java** technology stack, including **Jackson** for JSON transformation and **JDBC-based** database connectors.
+ **Database:****MySQL** is used for storage; the system supports parsing MySQL scripts and utilizes a built-in temporary database for analysis.
+ **Programming Language:** The project is primarily implemented using **Java**.

# Non-Functional Requirements
### 1. Processing Efficiency
+ The system shall support high-performance analysis, completing detection for large databases with thousands of entities within **30 minutes**.
+ Asynchronous processing must be supported, allowing users to perform other operations during detection.

### 2. Security
+ Sensitive data transmission must be encrypted via **SSL**.
+ Implement **Role-Based Access Control (RBAC)**.
+ The system must record operation logs and undergo regular security audits.

### 3. Availability
+ The system shall ensure high availability and provide clear feedback (e.g., success, error, or waiting states).
+ Transaction management must ensure the **atomicity** of all operations.

### 4. Flexibility
+ Adopt a decoupled frontend-backend architecture and a layered modular design.
+ Provide open **API interfaces** to support third-party integration.
+ The database design must be forward-looking to accommodate future increases in data structures.

### 5. Usability
+ User interactions must be ergonomic, ensuring that core functions are reachable within **three clicks**.
+ Provide novice tutorials and example files, and support core function experiences in a non-logged-in state.

# System Architecture Description

### 1. Infrastructure Layer

The Application Layer directly hosts the two core business scenarios: intelligent annotation and knowledge mining. It focuses on implementing domain-specific business logic, such as the configuration of multi-disciplinary annotation presets, complex project workflow management (creation, assignment, acceptance), and model fine-tuning and feedback loops based on research requirements. This layer interacts with users through a modern Web interface, shielding the complex underlying technical implementation and ensuring that researchers can focus on document processing and knowledge discovery.

### 2. Support Layer

The Support Layer enables low-coupling communication between modules through a microservice architecture, providing a highly cohesive set of general services for upper-layer applications. This layer acts as a bridge between business logic and underlying resources, with specific responsibilities including:
* **Automated Conversion Service**: Converts unstructured PDF documents into processable text formats.
* **Intelligent Scheduling Service**: Interfaces with large language models (e.g., GPT series) for automated information extraction and entity recognition.
* **Security & Quality Control**: Implements role-based access control (RBAC), data encryption and auditing, as well as annotation quality verification.
* **Community Collaboration Mechanism**: Manages the sharing and distribution of models, corpora, and preset configurations.

### 3. Application Layer

The Infrastructure Layer serves as the physical and logical foundation of the entire system, focusing on underlying data persistence, communication protocols, and runtime environments. It maintains relational data via MySQL, constructs complex knowledge graph relationships using Neo4j, and provides high-concurrency response support through Redis. Additionally, the Infrastructure Layer utilizes Minio for unstructured storage of massive documents and ensures the physical security of data transmission via the HTTPS protocol within a Linux environment. This layer is agnostic to specific business logic, aiming to provide stable and scalable computing and storage capabilities for the upper layers.
