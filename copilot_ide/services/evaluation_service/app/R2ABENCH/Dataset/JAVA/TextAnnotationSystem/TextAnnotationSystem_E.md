# Introduction
The **Intelligent Text Annotation and Mining System (ITAS)** is a comprehensive application platform designed to assist researchers in efficiently and accurately annotating paragraphs and entities from massive volumes of PDF literature, while enabling automated extraction and mining of key information. Serving primarily system annotation administrators, data annotators, and scientific researchers, ITAS aims to address the time-consuming and error-prone nature of traditional manual annotation. It also overcomes the limitations of existing third-party tools (such as Diigo or Alibaba Cloud NLP) regarding customized annotation for academic literature, direct PDF processing, large-scale extraction capabilities, and annotation quality control. By integrating advanced Large Language Model (LLM) technology and a multi-domain modular design, ITAS provides a powerful tool for knowledge localization and utilization in academic and professional fields, significantly accelerating the process of scientific discovery and innovation.

# Core Objectives
+ **Support Multi-domain Annotation:** Provide specific annotation requirements across a wide range of disciplines, including social sciences, biomedicine, and engineering, through modular and configurable presets.
+ **Enhance Human Annotation Efficiency and Consistency:** Offer a user-friendly interface, predefined rule templates, and intelligent recommendation features to reduce annotation difficulty and ensure data quality.
+ **Implement Automated Information Extraction:** Utilize LLMs (such as the GPT series) and Natural Language Processing (NLP) technologies to automatically extract preset key information from documents, supporting few-shot learning for data-scarce scenarios.
+ **Build a Community Collaboration Ecosystem:** Establish a sharing mechanism that allows users to share annotation presets, models, and corpora, fostering cross-disciplinary knowledge sharing and community collaboration.
+ **Ensure Annotation Data Quality:** Provide reliable, standardized datasets for scientific research and model training through precise positioning, data validation, and quality control functions.

# Functional Features
### Text Annotation Subsystem
+ **Project Creation:****When** the annotation administrator needs to launch a new task, the administrator performs the actions of filling in project information, uploading documents to be annotated, defining label keys, and assigning annotation personnel.
+ **Account Registration:****When** a user accesses the system for the first time, the data annotator performs the actions of entering account credentials and allowing the system to verify legality and password strength.
+ **System Login:****When** a registered user accesses the system, the data annotator performs the actions of entering credentials and allowing the system to verify account existence and password accuracy.
+ **Execution of Annotation:****When** task assignment is complete and the status is "Incomplete," the data annotator performs the actions of loading documents and marking paragraphs and key information according to system guidance.
+ **Project Acceptance:****When** the annotator submits a task, the annotation administrator performs the actions of auditing annotation results, exporting standardized data (JSON/XML), or reassigning the task.

### Intelligent Mining Subsystem
+ **Document Processing:****When** a researcher uploads PDF literature, the system performs the actions of format validation, converting the file to TXT format, and completing front-end visual rendering.
+ **Model Selection:****When** preparing for data mining, the researcher performs the actions of selecting a model from system presets, community shares, or third-party interfaces (such as ChatGPT) and configuring fine-tuning parameters.
+ **Automated Extraction:****When** document conversion and model selection are complete, the system performs the actions of automatically locating paragraphs containing key information and identifying specific entities within the text.
+ **Model Sharing:****When** a researcher completes model fine-tuning, the researcher performs the actions of filling in a model description and uploading it to the community preset library for others to use.
+ **Annotation Feedback:****When** viewing automated extraction results, the researcher performs the actions of editing or correcting the identification results and submitting feedback to drive iterative model optimization.

# Technical Constraints
+ **Backend Framework:****Spring Cloud** (Microservices architecture) or **Flask** Web framework.
+ **Databases:**
    - Relational Database: **MySQL 8.0**.
    - Graph Database: **Neo4j**.
+ **Caching Technology:****Redis 6.0**.
+ **File Storage:****Minio**.
+ **Programming Languages:****Python** (Backend) and **TypeScript** (for Frontend code style specifications).

# Non-Functional Requirements
**Processing Efficiency**

+ **Document Loading:** The time to open an annotation document should be controlled within **5 seconds**.
+ **Annotation Response:** The response time for annotation operations should be within **0.5 seconds**.
+ **Document Conversion:** The processing time for converting a single document should be between **5 and 10 seconds**.
+ **Extraction Response:** The response time for a single information extraction task shall not exceed **60 seconds**.

**Security**

+ **Access Control:** Implement Role-Based Access Control (RBAC) to strictly limit user access to data and functions.
+ **Data Protection:** Use the **AES-256** algorithm for encrypted storage of sensitive data and enforce the **HTTPS** protocol for all transmissions.
+ **Audit & Monitoring:** Maintain detailed operation logs for all users to track security risks and monitor user behavior.

**Availability**

+ **Fault Handling:** The system must possess comprehensive error detection, reporting, and automatic recovery mechanisms (e.g., reconnection, retries).
+ **Fault Tolerance:** For unrecoverable errors, data backup and failover mechanisms must be provided to ensure data security and system continuity.

** Flexibility**

+ **Decoupled Design:** Adopt principles of low coupling and high cohesion, implementing inter-module communication through interface definitions and message passing for easy reconstruction.
+ **Extensibility:** Support component extensions and functional upgrades through plugin-based development while maintaining backward compatibility.

**Portability**

+ **Cross-Browser Support:** Support the latest stable versions of modern browsers (Chrome, Edge, Firefox, Safari, etc.).
+ **Environment Compatibility:** The system must run stably on various Linux distributions, such as Ubuntu and CentOS.

# System Architecture Description

### 1. Infrastructure Layer

The Application Layer integrates the atomic capabilities provided by the Support Layer into functionally logical components with business significance, such as multi-domain literature annotation workflows, intelligent mining project management, and community-driven preset sharing. This layer handles user interaction logic through a highly decoupled microservice architecture and leverages the AI predictive capabilities of the Support Layer to convert PDFs into structured knowledge. Its design is independent of changes in the underlying technology stack, ensuring the system can be flexibly migrated to different academic or research domains.

### 2. Support Layer

This layer deeply integrates natural language processing libraries and deep learning frameworks (e.g., PyTorch, TensorFlow), encapsulating complex artificial intelligence algorithms into standardized capability components such as semantic understanding, entity recognition, and format parsing services. Additionally, it addresses cross-cutting concerns by implementing data routing between the front-end and back-end via a unified RESTful API protocol. It also incorporates built-in Role-Based Access Control (RBAC), operation log auditing, and security encryption mechanisms, ensuring business logic operates within a secure and controllable environment.

### 3. Application Layer
This layer encompasses high-performance computing resources (e.g., multi-core, high-frequency CPUs and large-capacity memory) and high-speed storage networks. It also integrates diverse data persistence mechanisms, including relational databases for structured data, object storage for unstructured documents, and caching systems for high-performance retrieval. Its core responsibility is to shield the upper layers from the physical differences of underlying hardware and operating systems, providing a stable and scalable distributed runtime environment.