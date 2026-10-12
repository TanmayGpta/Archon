# Introduction

The Lab Recruitment Research Internship Information Management Platform is an integrated system designed specifically for university faculty and students to manage research internship information. It aims to break the fragmented state of current on-campus research recruitment, which primarily relies on WeChat group forwarding or word-of-mouth. By integrating features such as research project publishing, online application, resume management, supervisor search, and community interaction, the application provides students with a comprehensive and public channel for research opportunities while offering supervisors efficient tools for recruitment and student management. The platform focuses on solving the core pain point of information asymmetry by strictly limiting the user base to faculty and students verified via university email and providing an enterprise certification mechanism for internship referrals to ensure the authenticity and privacy of communications.

# Core Objectives

* **Information Integration and Publicity**: Integrate on-campus research internship information and establish a public, comprehensive dissemination mechanism.

* **Two-way Communication and Selection**: Enable online communication and mutual selection between supervisors and students to improve response speed for recruitment and applications.

* **Standardized Project Management**: Provide full-cycle management of research projects, from creation and capacity adjustment to status updates and mutual evaluations.

* **Real-name Identity Authentication**: Use university email domain verification to ensure that all registered users are authentic students or faculty.

* **Vertical Community Interaction**: Build a social environment for research experience sharing and internship referrals to enhance user engagement.

* **Precise Project Recommendation**: Utilize collaborative filtering and tag matching to achieve personalized adaptation between research projects and student skills.

# Functional Features 

### Research Internship Project Module

* When a student enters the platform homepage, the system provides personalized project recommendations based on interest tags and historical behavior.

* When a student clicks on project details, the system displays comprehensive information including internship content, recruitment count, supervisor bio, and required skills.

* When a supervisor needs to recruit, the supervisor publishes a research project specifying start dates, duration, online/offline mode, and other requirements.

* When a student looks for specific opportunities, the student performs project searches on the search page according to school, supervisor, or other rules.

* When a project is ongoing or concluding, the supervisor manages the project by switching its status or increasing/decreasing the recruitment quota.

* When a student finds a desired position, the student submits an application to that project.

* When a project is set to the completed state, both the supervisor and the student perform mutual evaluations and ratings of each other's performance.

### Personal Information and Authentication Module

* When a user accesses the platform for the first time, the user completes registration by receiving a verification code via a university domain email.

* When a student needs to showcase qualifications, the student uploads a local resume file in PDF format (up to 10MB).

* When a student has corporate background, the student verifies via a corporate email to unlock the authority to post internship referral threads.

* When both parties make mutual selection decisions, the supervisor and student view each other's personal information, such as resumes or educational history, through the system.

### Community Interaction Module

* When a regular student user wishes to share experiences, the student publishes a standard post within a 400-word limit in the community.

* When a certified student user provides job opportunities, the student publishes an internship referral post.

* When a student browses community content, the student can post comments on any thread or add threads to their favorites.

* When the system displays community content, the system performs heat-based sorting based on weights for likes, comments, views, and time decay.

### Management Terminal Module

* When an administrator logs in, the administrator performs a first-round manual audit of the university identity qualifications for both faculty and student users.

* When an administrator identifies prohibited content, the administrator directly deletes violating community posts or comments.

# Technical Constraints

1. **Mobile Platform**: Supports Android 7.0 and above; iOS 8.0 and above.

2. **Backend Framework**: The backend development framework is Django.

3. **Database**: MySQL is used as the database.

4. **Programming Language**: It is explicitly required that Python code must follow the PEP8 coding standard.

# Non-functional Requirements

* **Processing Timeliness (Performance)**: The system must guarantee feedback for any user input within 1 second.

* **Security**:
    * **Access Control**: Ensure users only access information within their permissions (e.g., supervisors can only see resumes of students who applied to their projects; students cannot see each other's resumes).

    * **Protection Mechanisms**: Implement login/operation frequency limits and abnormal behavior detection models to prevent frequent registration or mass malicious commenting.

* **Data Protection**: Implement encryption for user login and chat communications.

* **Reliability and Robustness**: The system must operate normally under any possible user input and provide feedback for errors.

* **Flexibility (Scalability)**: Component coupling must be reduced to ensure the system is easy to extend and maintain.


* **Portability**: The system must be viewable across multiple devices and maintain consistent page logic.

* **Compatibility**: Ensure the system can be accessed normally through major mainstream browsers (Chrome, Firefox, Edge).

# System Architecture Description

### 1. Application Layer

This layer serves as the business execution environment directly perceived by users, highly aggregating specific business logic in the field of scientific research internships. Its core responsibilities are to implement **full lifecycle management of research projects** (publication, search, application, peer evaluation) and **community interaction** (posting internal referral discussions, comment interactions, popularity-based sorting). Independent of underlying implementation details, this layer transforms system functionalities into personalized service scenarios for two user roles—"students" and "mentors"—by integrating **collaborative filtering recommendation algorithms** and **tag matching mechanisms**.

### 2. Support Layer

The Support Layer provides a cohesive set of general services to ensure the efficient and secure operation of the system.

*   **Security and Compliance Services**: Ensures the legality of platform content and the authenticity of user identities through multi-level review mechanisms (first-round verification of university identity, second-round verification of enterprise qualifications) and content filtering logic.

*   **Data Management and Flow**: Implements structured data storage and consistency maintenance based on defined **complex relationship models** (e.g., many-to-many relationships among mentors, students, projects, and labs).

*   **System Assurance Services**: Integrates mechanisms for log auditing, risk control detection, message notifications, and abnormal behavior interception, providing a stable functional support environment for the Application Layer.

### 3. Infrastructure Layer

*   **Communication and Interaction Foundation**: Supports cross-platform access (mobile platforms Android/iOS and mainstream PC browsers), utilizing broadband networks and standard communication protocols to ensure efficient data distribution.

*   **Computation and Storage Resources**: Provides millisecond-level response capabilities (feedback within 1 second) and data persistence guarantees, based on high-performance hardware configurations (such as quad-core CPUs, memory redundancy) and back-end database clusters.

*   **Standard Specifications**: The entire infrastructure strictly adheres to GB/T series national standards and PEP8 coding standards throughout the development lifecycle, ensuring system portability and maintainability.