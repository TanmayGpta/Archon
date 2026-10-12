# Introduction

PromptHub is a community-driven Web application dedicated to the sharing of AI-generated artwork and their corresponding prompts. Against the backdrop of the increasing popularity of AI painting technology, this platform aims to provide an efficient and convenient space for AI artists, enthusiasts, and beginners to explore and exchange prompts. Its core value lies in empowering users to select more precise instructions and generate high-quality works by showcasing artistic pieces created with various models and prompts. The system is designed to address core user pain points—such as the difficulty of finding high-quality AIGC content, the steep learning curve of prompt engineering, and the lack of specialized community interaction—ultimately building an imaginative and collaborative AI art community.

# Core Objectives

* **Resource Sharing**: To provide a platform for creators to share AI artworks, relevant model information, and precise prompts.
* **Efficient Retrieval**: To support users in quickly locating preferred works through prompts, categories, or multi-level search functions.
* **Community Interaction**: To establish comment and like systems that facilitate technical exchange and Q&A among users regarding AI painting.
* **Content Quality Control**: To maintain community standards and filter out low-quality submissions through an administrator review mechanism.
* **Personalized Service**: To offer personalized recommendations and work management features based on user behavior (e.g., favorites, follows).

# Functional Features

### User/Guest System

* **Registration Trigger**: When a guest clicks "Register" on the homepage and enters their information, the system performs email verification and creates a new account.
* **Login Trigger**: When a user enters the correct username and password, the system performs identity authentication and grants access to restricted features.
* **Information Modification**: When a user enters individual settings, the user performs actions to modify their avatar, username, or reset their password.
* **Social Interaction**: When a user browses another person's profile, the user performs the action of following or unfollowing that user.

### Display and Management System

* **Work Upload**: When a user submits an AI artwork and its prompt, the display system records the upload and places it in the review queue.
* **Work Review**: When an administrator views the pending list, the administrator performs the action of approving or rejecting the work.
* **Search and Query**: When a user enters keywords or selects a sorting method, the display system filters and arranges the works for presentation.

### Favorites and Comment System

* **Favorites Management**: When a user clicks the "Favorite" button, the favorites system categorizes and stores the work (Public/Private).
* **Comment Interaction**: When a user enters content on a work's detail page, the comment system publishes the comment or a reply to others.
* **Violation Cleanup**: When an administrator identifies inappropriate remarks, the administrator performs the action of deleting comments or replies.

### Recommendation and Notification System

* **Message Push**: When the review status of a work changes or interaction is received, the notification system performs a real-time message push.
* **Intelligent Recommendation**: When a user enables personalized services, the recommendation system suggests similar works based on user preferences.

# Technical Constraints

1. **Mobile/Desktop Platforms**: Graphical interface operating system environments based on **Windows 7, macOS 8.0, or higher**.
2. **Backend Framework**: Developed using the **Django** framework.
3. **Database**: **SQLite** (lightweight engine) for the initial development phase, with plans to migrate to **MySQL** in subsequent iterations.
4. **Programming Languages**:
    * Frontend: HTML, CSS, **JavaScript**.
    * Backend: **Python**, **Java**.
    * Algorithm Support: **Python**.

# Non-Functional Requirements

* **Response Time**: The system must demonstrate high responsiveness; page loading and functional transitions should occur within an acceptable timeframe under standard bandwidth to avoid lag.
* **Security**: Access control is managed via encrypted password storage and mandatory identity verification (e.g., email verification codes); the system must be able to limit concurrent access to ensure stability.
* **Availability**: The system must guarantee the atomicity of operations (e.g., database updates) and maintain robustness to ensure core business processes remain uninterrupted under normal network conditions.
* **Flexibility/Scalability**: The code structure must be clear and modular (e.g., layered architecture) to facilitate future feature iterations and database migrations.
* **Portability**: The system must support cross-browser operation, compatible with mainstream browser engines including Firefox (Kernel 119.0+) and Chromium (Kernel 110.0+).

# System Architecture Description

### 1. Application Layer

This layer faces end-users (visitors, regular users, administrators) and focuses on specific business scenarios and native product details. Its core responsibility is to achieve a **closed loop of business logic**. Through modules such as the "User System," "Display System," "Collection System," "Comment System," and "Administrator Review System," it handles interactions between users and AI artworks/Prompts. It is independent of hardware, directly responds to business requirements (such as artwork upload, Prompt classification and retrieval, personalized recommendation toggle, etc.), and translates business intent into calls to lower-layer services.

### 2. Support Layer

This layer provides **a set of general services with cohesive responsibilities**. It serves as a bridge connecting high-level applications with underlying infrastructure by encapsulating general logic.

*   **Service Cohesion**: Includes the "Recommendation System" (handling complex ranking and preference algorithms) and the "Notification System" (handling asynchronous message delivery).
*   **Development Framework Support**: Utilizes the MTV/component-based programming models provided by the **Django** (Python) and **Vue.js** frameworks to offer structured logic support and interface rendering capabilities for the application layer.
*   **Computational Support**: Provides algorithmic support for AI artwork generation and analysis in the upper layers through the **PyTorch** and **TensorFlow** frameworks.

### 3. Infrastructure Layer

This layer is the physical and logical foundation of the system. It is independent of specific AIGC business logic and focuses on underlying computing, storage, and distribution mechanisms.

*   **Storage Mechanism**: Employs the lightweight **SQLite** database engine for the physical persistence of data.
*   **Delivery and Runtime Environment**: Utilizes **Docker** containerization technology to build a portable runtime environment, ensuring the system runs stably across different operating systems (e.g., Windows, macOS) and browser engines (Chromium, Firefox).
*   **Communication Foundation**: Relies entirely on basic network connectivity as a prerequisite for the implementation of all functionalities.