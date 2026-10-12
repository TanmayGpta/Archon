# Introduction

The Model Evolution Version Management and Visualization Tool is an educational and management application specifically designed for the machine learning field, aiming to display the architecture, performance, and evolutionary relationships of complex machine learning models through visual means. With the rapid development of artificial intelligence, beginners often struggle to find a starting point among numerous models and find it difficult to understand the iterative and referential relationships between them; this project is designed to address this core pain point by providing intuitive learning guidance for learners, while offering a platform for researchers and contributors for model version management and collaboration.

# Core Objectives

* **Visual Presentation**: Intuitively display the evolutionary relationships and specific evolutionary details between multiple machine learning models through forms such as topological graphs.
* **Educational Support**: Provide effective learning paths for beginners, helping them quickly understand model structures, source code, and performance metrics.
* **Model Version Management**: Implement full lifecycle management including uploading, online editing, modification, and deletion of machine learning models (e.g., ONNX, PyTorch source code).
* **Evolutionary Relationship Definition**: Enable contributors to independently define, add, or delete evolutionary logic between models, including the addition/deletion of operators and parameter adjustments.
* **Permission and Security Control**: Establish a comprehensive user role system (Learner, Contributor, Administrator) to ensure secure data storage and compliant permission changes.

# Functional Features

### 1. Account and Permission Module

* When a user needs to access the system to perform operations, the **User** performs **registration, login, or logout** actions.
* When a user forgets a password or needs to upgrade permissions, the **User** performs **password modification or initiates a permission change request** action.
* When the administrator receives an application or needs to maintain order, the **Administrator** performs **user management, user deletion, or permission change audit** actions.

### 2. Model Browsing and Searching Module

* When a user looks for a specific model, the **Learner** performs a **keyword search** action.
* When a user selects a model, the **Learner** performs **viewing basic model information, evolution graphs, and evolution details** actions.

### 3. Model Contribution and Editing Module

* When a contributor has new data to share, the **Contributor** performs **uploading ONNX files or PyTorch source code** actions.
* When model information is found to be incorrect or needs optimization, the **Contributor** performs **online code editing, modifying model descriptions, or deleting models** actions.

### 4. Evolutionary Relationship Definition Module

* When an iterative relationship exists between new and old models, the **Contributor** performs **adding or deleting model evolution relationships** actions.
* When specific structural changes need to be described (e.g., reusing a layer), the **Contributor** performs **modifying model evolution details** actions.

# Technical Constraints

1. **Mobile Platforms**: The web interface must adjust to device environments such as smartphones and tablets, supporting operation across various mobile browsers.
2. **Backend Framework**: Developed using the **Django** framework.
3. **Database**: Utilizes **Neo4j** (for storing evolutionary relationship graphs) and **MySQL** storage technologies.
4. **Programming Languages**: Primarily uses **Python** (for library support) and **React** (JavaScript/TypeScript) for frontend development.

# Non-functional Requirements

* **Processing Efficiency**: Response time for static pages must be under 1 second; the time from adding a model to generating results must not exceed 1 minute.
* **Security**: Implementation of OAuth 2.0 multi-factor authentication; sensitive data transmission and storage must be encrypted via TLS; models in the database must be encrypted using AES/DES symmetric encryption.
* **Availability**: The system must support 24/7 operation with unplanned downtime (including upgrades/maintenance) of less than 30 hours per year; the system must switch to a standby machine within 0.5 hours during a failure and ensure data consistency during simultaneous administrative edits.
* **Flexibility/Scalability**: Requires separation of code structure and presentation (HTML and CSS separation) and modular writing to ensure easy fault localization and functional enhancement.
* **Portability**: Based on a B/S (Browser/Server) architecture, the system must be compatible with Windows, macOS, and Linux, and adapt to mainstream browsers like Chrome, Firefox, and 360, as well as various mobile screen sizes.

# System Architecture Description

This system adopts a **B/S (Browser-Server) layered architecture**. Through clear division of highly cohesive responsibilities, it constructs a complete virtual machine system spanning from underlying data support to high-level business scenarios:

### 1. **Application Layer**

As the topmost layer, it directly serves three user roles: "Learners", "Contributors", and "Administrators", focusing on the visualization business scenarios for machine learning models. This layer utilizes the React framework to build a highly interactive virtual interface, enabling the topological display of model architectures, dynamic visualization of evolutionary relationships, and online editing of model source code. It encapsulates specific business process logic, such as permission change approval workflows, model upload, and evolutionary detail definition, ensuring the decoupling of business logic from underlying implementation details.

### 2. **Support Layer**

This layer provides a cohesive set of general services based on the Django framework, serving a core bridging function. It responds to frontend requests via RESTful APIs or similar mechanisms, handling responsibilities such as identity verification (e.g., OAuth 2.0 two-factor authentication), data encryption processing (TLS, AES/DES encryption), as well as the parsing and computation of complex model evolution logic. Furthermore, this layer leverages Python libraries to process ONNX and PyTorch models, transforming raw model data into evolutionary topological structures recognizable by the application layer.

### 3. **Infrastructure Layer**

Positioned at the lowest level of the architecture, this layer consists of computation, storage, and communication protocols and is independent of specific application business logic. In terms of storage, the system utilizes the **Neo4j graph database** to manage complex model topological evolution relationships, supplemented by the **MySQL relational database** for storing user information and basic attributes, forming a heterogeneous storage foundation. In terms of communication, this layer relies on standard protocols such as HTTP/HTTPS and TCP/IP to ensure reliable data transmission. It also provides fundamental computation and I/O distribution mechanisms based on a cross-platform operating system environment (Windows/Linux/macOS).