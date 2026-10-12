# Introduction

ReTool is a software requirement management tool specifically designed for continuous evolution. Recognizing that requirements are often difficult to define fully in the early stages and remain in a state of dynamic change during development, this application aims to address core pain points found in popular market tools, such as low automation in requirement import/analysis, excessive complexity, and high learning costs. By integrating advanced algorithms for requirement itemization, structuring, conflict detection, relationship analysis, and commonality identification, the project delivers core value by automatically extracting clear items from requirement documents and predicting the impact of changes. Its target users include management personnel (e.g., project managers, team leaders) who need to handle frequent changes, general project members who require precise requirements for development and testing, and system administrators responsible for maintenance.

# Core Objectives

* **Automated Requirement Processing**: Use algorithms to automatically extract clear requirement items from imported Word documents or text and achieve structural organization.
* **Intelligent Requirement Analysis**: Implement conflict detection, commonality identification, and correlation analysis between requirements to proactively predict the impact of changes.
* **Full Lifecycle Traceability**: Establish forward traceability mechanisms from requirements to design modules and test cases to assist change-oriented development and testing.
* **Efficient Project and Personnel Management**: Provide multi-level user authority management and flexible project configuration functions, supporting role definitions across different projects.
* **Enhanced Evolution Efficiency**: Accelerate the iteration process of software projects during continuous evolution by reducing manual intervention and learning curves.

# Functional Features

### User Management Module

* When a user accesses the registration interface and fills in their information, the **User** performs the account registration action.
* When a user enters correct credentials, the **System User** performs the login action to obtain project access permissions.
* When the personnel list needs maintenance, the **System Administrator** performs actions to add/delete users or modify user roles.
* When a user forgets their password, the **System Administrator** performs the password reset action.

### Project Management Module

* When a new business initiative starts, the **Project Manager** performs the actions of creating a project and setting project baseline nodes.
* When project personnel change, the **Project Manager or Team Leader** performs actions to add/remove project members or modify project roles.
* When project information needs updating, an **Authorized User** performs actions to modify project details or view the project list.

### Requirement Management Module

* When a user uploads a requirement document, the **Requirement Management Module** performs the actions of importing requirement items from Word and automated itemization.
* When requirements evolve, the **Project Manager or Team Leader** performs actions to create, modify, delete, or move the position of requirement items.
* When impact analysis is conducted, the **Algorithm Service** performs actions for requirement conflict detection, commonality identification, and correlation analysis.
* When development progress needs to be tracked, the **User** performs the action of establishing forward traceability for requirements (to design or testing).

# Technical Constraints

1. **Mobile Platform**: The frontend utilizes the **Vue.js** framework to build a web-based interface.
2. **Backend Framework**: The server-side adopts a microservices architecture using the **Flask** lightweight web framework based on **Python**.
3. **Database**: **MongoDB** (NoSQL), a document-oriented database, is used for data storage.
4. **Programming Language**: Primarily **Python** (used for Flask backend, PyTorch machine learning libraries, and NLP processing).

# Non-Functional Requirements

* **Processing Timeliness (Response Time)**: The system must limit concurrent access to ensure stability; when the peak load is exceeded, the system will block and wait for user processes until resources become available.
* **Security**:
* **Access Control**: The system strictly distinguishes between system roles (Administrator, General User) and project roles (Manager, Leader, Member), assigning CRUD permissions based on these roles.
* **Data Protection**: Users must log in before using the system; the database is responsible for successfully saving and protecting user credentials.


* **Availability**: System operation depends on network connectivity; if disconnected, all requirements become inaccessible. Additionally, it is recommended to run high-load algorithm services on high-performance servers to ensure availability.
* **Flexibility/Scalability**: The server-side adopts a microservices architecture where sub-services are developed, deployed, and upgraded independently, providing high flexibility and scalability.
* **Portability**: Using the lightweight Vue.js framework for the frontend, the UI design must account for responsive screen sizing and consistent rendering across various operating systems.

# System Architecture Description

The system adopts a classic **decoupled front-end and back-end** approach combined with a **microservices-based** layered architecture. It facilitates a complete business loop—from user interaction to complex requirement analysis—through seamless cross-layer collaboration:

### 1. Application Layer

As the topmost tier, this layer directly interfaces with end-users (such as Project Managers and System Administrators). Built on the **Vue.js framework**, it provides a lightweight web interface responsible for rendering the final results of business logic. The Application Layer captures user commands (e.g., requirement imports, conflict detection requests) and converts them into standardized service calls for the underlying layers. Its core responsibility lies in **business scenario awareness and presentation**, abstracted away from direct data storage or specific algorithmic implementations.

### 2. Support Layer

The Support Layer functions as the "virtual machine" or core bridge of the system. It provides a cohesive set of general services via a **microservices architecture** implemented with the **Flask framework**:

* **Service Governance & Orchestration**: Collaborates with various business microservices (User Management, Project Management, and Requirement Management) through a gateway to handle business logic orchestration and distribution.
* **Domain Capability Abstraction**: Integrates and encapsulates high-performance **algorithm services** (utilizing NLP, PyTorch, and Word2vec models). It abstracts complex computational logic—such as "Requirement Itemization," "Conflict Detection," and "Commonality Recognition"—into callable interfaces, shielding the rest of the system from algorithmic complexity and hardware performance dependencies.

### 3. Infrastructure Layer

Serving as the fundamental foundation of the system, this layer utilizes **MongoDB** to provide a document-oriented NoSQL storage mechanism. It is responsible for the persistence and CRUD (Create, Read, Update, Delete) operations of all business objects, including user information, project baselines, and requirement item trees. The Infrastructure Layer is decoupled from the "processing logic" above, responding to instructions from the Support Layer via standard data interaction protocols to ensure data integrity and consistency.