# Introduction
This project aims to develop an innovative **Text Adventure Game Platform** powered by Large Language Models (LLMs), featuring highly interactive community functions. By leveraging the natural language processing and reasoning capabilities of LLMs, the application breaks through the fixed decision boundaries of traditional games. Through random events and dynamic plot generation, it provides players with a unique, immersive experience every time they play. The project primarily targets players who enjoy text adventures, exploring unknown storylines, role-playing, and sharing interactions within a community. The system is designed to solve core pain points such as linear plots, low freedom, and the lack of social interaction in traditional text games, creating a comprehensive platform that integrates entertainment, creative sharing, and inspirational exchange.

# Core Objectives
+ **Implement Dynamic Plot Generation:** Utilize the reasoning power of LLMs to ensure every game storyline is unique.
+ **Build a Random Event System:** Design diverse emergency and choice-based events to enhance gameplay variety and challenge.
+ **Establish Decision Impact Mechanisms:** Ensure player choices effectively guide the story toward different developmental directions.
+ **Provide Deep Role-Playing:** Allow players to freely choose identities and actions to shape personalized game characters.
+ **Create a Community Interaction Platform:** Provide a shared community to support experience sharing, plot discussion, and the exchange of inspiration.
+ **Refine Achievement and Incentive Systems:** Design an achievement system to encourage challenges and enhance replay value.
+ **Deliver Chapter-based Gameplay:** Utilize multi-chapter progress designs and different themes to stimulate player exploration.
+ **Ensure Premium User Experience:** Provide an intuitive and user-friendly interface to ensure a smooth onboarding experience.

# Functional Features
### 1. Community & User Interaction
+ **When** a guest enters the homepage or search page, the guest performs the actions of browsing posts, reading comments, and searching for topics or users of interest.
+ **When** a guest provides a valid email, username, and password on the registration page, the guest performs the action of registering as a community user.
+ **When** a user enters the correct account credentials on the login interface, the user performs the action of logging into the system and accessing the initial page.
+ **When** a user clicks "Post" and enters a subject, content, or uploads images, the user performs the action of publishing a post containing game screenshots or reviews.
+ **When** a user is on a post details page, the user performs the actions of commenting on the post, replying to other comments, or deleting their own comments/replies.
+ **When** a user wishes to save interesting content, the user performs the action of adding a post to bookmarks or creating a new bookmark folder.
+ **When** a user enters their personal profile page, the user performs the actions of modifying personal information (avatar, username) or viewing their browsing history.
+ **When** a post receives a comment or reply, or when an audit status is updated, the system performs the action of sending a notification message to the relevant user.

### 2. Core Game Functions
+ **When** a user selects "Start New Game," the user performs the action of creating a new cloud-based game save and initiating the game flow.
+ **When** a user enters the game interface, the user performs the action of viewing the list of existing game saves.
+ **When** a user selects an existing save, the user performs the actions of continuing previous game progress or deleting that save.
+ **When** a user wishes to share their gaming experience, the user performs the action of sharing an existing game save to the community in the form of a post.
+ **When** a user starts a new game and the background information is empty, the user performs the action of filling in and submitting the game's background story information.
+ **When** a user engages in dialogue or makes a choice within the game, the system performs the actions of generating random events and subsequent options based on the save content to advance the game.

### 3. Administrator Backend Functions
+ **When** an administrator logs into the management system, the administrator performs the action of viewing the full list of users and posts.
+ **When** an administrator views the pending audit list, the administrator performs the action of reviewing user-published posts (approve or reject).
+ **When** a user commits a violation, the administrator performs the action of banning or unbanning the violating account.

# Technical Constraints
+ **Mobile Platform / Client Environment:** Must be compatible with various client devices; requires relatively modern hardware and a smooth operating system.
+ **Frontend Framework:****Vue.js** (for UI construction) and **Nuxt.js** (for Server-Side Rendering).
+ **Backend Framework:****Iris** (High-performance Web framework).
+ **Database & Storage:****MySQL** (Data storage) and **Gorm** (ORM library for database operations).
+ **Programming Languages:****Go** (Backend) and **JavaScript** (Frontend).
+ **Virtualization & Deployment:****Docker** containers and **Kubernetes** (K8s) orchestration platform.

# Non-Functional Requirements
### 1. Processing Efficiency
+ **Game Response:** Server-side response time for text generation and reasoning shall not exceed **20 seconds**.
+ **System Interaction:** Response times for login, logout, and entering/exiting the game shall be controlled within **3 seconds**.
+ **Data Access:** Access time for 5 save slots shall not exceed **3 seconds**.
+ **Interaction Feedback:** The interval between a user action and system feedback shall not exceed **500ms**.

### 2. Security
+ **Data Encryption:** Sensitive data such as passwords and personal information must be encrypted during transmission and storage.
+ **Access Control:** A permission mechanism must be established to ensure only authorized administrators can access sensitive data and backend functions.
+ **Vulnerability Management:** Regular security scans and assessments must be conducted to fix vulnerabilities promptly.

### 3. Availability
+ **Concurrency:** The server-side shall support at least **100 concurrent users** playing the game simultaneously.
+ **System Stability:** The frequency of unexpected exceptions shall be less than **once per month**.
+ **Data Integrity:** The system must verify data integrity during save/load operations to prevent loss or corruption.
+ **Fault Tolerance & Recovery:** The system shall detect failures, provide error prompts, and maintain continuous operation during network fluctuations or server faults.

### 4. Flexibility
+ **Modularity:** Adopt low-coupling modular design for easy maintenance and expansion.
+ **Version Control:** Version control tools must be used to manage code and track history.
+ **Automated Testing:** Establish unit and integration testing systems to ensure stability after functional modifications.

### 5. Portability
+ **Cross-Platform Adaptation:** The game interface must display and operate correctly across different devices, resolutions, and screen sizes.

# System Architecture Description

### 1. Infrastructure Layer

This layer leverages Docker container technology to shield the differences in underlying physical hardware and builds a virtualized computing environment based on the Kubernetes platform. It is responsible for the automated orchestration, load balancing, and self-healing of infrastructure, providing a highly reliable and elastically scalable foundation for computing and communication to the upper layers.

### 2. Support Layer

This layer integrates the high-performance Iris Web framework and Gorm ORM library, achieving decoupling between business logic and heterogeneous databases (e.g., MySQL). Its core responsibilities include providing unified session management, data persistence interfaces, and general service components. It shields the application layer from complex backend communication details, ensuring the efficiency and consistency of data interactions.

### 3. Application Layer
This is a collection of high-level logic tailored for specific business scenarios. The frontend is built on the Vue.js and Nuxt.js frameworks, constructing a responsive interactive interface through the Server-Side Rendering (SSR) mechanism. This layer deeply integrates the inference capabilities of Large Language Models (LLM), translating specific business instructions into dynamically generated storylines and random events. The Infrastructure Layer directly responds to user-specific needs in game progression, community interaction, and account management. By utilizing the general services provided by the Support Layer, it completes the business closed-loop from the frontend view to the backend logic.