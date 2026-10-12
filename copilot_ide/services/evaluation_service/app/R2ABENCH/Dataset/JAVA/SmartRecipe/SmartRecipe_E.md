# Introduction
**Smart Recipe** is a mobile application primarily designed for the Android platform. It leverages deep learning technology to address the lack of tools in the current market that can generate detailed recipes directly from food photography. Serving food enthusiasts, catering companies, and system administrators, the platform allows users to obtain ingredient lists and cooking instructions with just one photo. Additionally, it offers calorie estimation, food interaction warnings (contraindications), and intelligent recommendations based on user preferences. By integrating image recognition with health analysis, Smart Recipe lowers the barrier to culinary knowledge while helping users manage dietary health and social sharing more conveniently.

# Core Objectives
+ **Implement "Photo-to-Recipe" Recognition:** Convert dish photos taken by users into graphic recipes containing ingredients and preparation steps through image recognition and big data analysis.
+ **Provide Personalized Recommendations:** Analyze taste preferences based on user search history and browsing data to intelligently recommend relevant cuisines and dishes on the homepage.
+ **Offer Food and Nutritional Analysis:** Analyze photographed food to retrieve nutritional components, calorie counts, and thermal energy information, providing associated dietary advice.
+ **Formulate Personalized Dietary Plans:** Develop precise meal-by-meal calorie plans based on physical data (height, weight, etc.), supporting daily check-ins and feedback analysis.
+ **Build a Food Social Community:** Create a social exchange platform similar to a "Moments" feed, allowing users to upload dishes, like posts, and share cooking experiences in comments.

# Functional Features
### 1. Login and Verification
+ **When** a user or administrator enters their account, password, and captcha on the login interface and clicks "Login," the system performs a permission validation; if passed, it navigates to the main interface; otherwise, it remains on the login screen.

### 2. Photo Recognition
+ **When** a user clicks the camera button to capture or upload a cropped food image, the server performs calculations on the image; if identified as food, it performs the action of returning recipe data; if identified as non-food, it returns an error message.

### 3. Recipe Retrieval
+ **When** a user enters recipe keywords into the search bar and clicks query, the server performs a search for matching recipes in the database and returns them to the user sorted by relevance.

### 4. Community Sharing and Auditing
+ **When** a user edits a food post with text and images in the community interface and clicks upload, the system performs the action of submitting the content to a "Pending Review" status.
+ **When** an administrator clicks the audit button to view details of an uploaded recipe, the administrator performs a judgment on content compliance; if approved, the system publishes it to the community and notifies the user; if rejected, it returns the failure reason.

### 5. Nutritional Analysis and Advice
+ **When** a user clicks the nutritional analysis button after identifying a recipe, the server performs the action of generating personalized nutrition analysis and dietary advice by combining current recipe data with user health data (height, weight, etc.).

### 6. Intelligent Recommendation
+ **When** a user clicks the community button or a recommendation section, the system performs the action of displaying recipes that meet the user's personalized needs using recommendation algorithms based on historical queries and sharing data.

### 7. Recipe Management
+ **When** an administrator completes text and image editing on the "Add Recipe" page and clicks upload, the system performs the action of writing the new recipe information into the database.

# Technical Constraints
+ **Mobile Platform:** Developed primarily for **Android** mobile devices.
+ **Backend Frameworks:** * **Spring Boot:** Used for primary business logic processing.
    - **Flask:** Used to host model inference services (AI).
+ **Databases:** * **MySQL:** Used for storing structured data.
    - **Redis:** Used for data caching to improve performance.
+ **Communication & Interaction:** * **Ajax:** Primary interaction between the frontend and backend service layers.

# Non-Functional Requirements
### 1. Processing Efficiency
+ The system shall maintain high processing efficiency, utilizing server computing power to quickly complete photo recognition and recipe generation to ensure a smooth user experience.

### 2. Security
+ **Access Control:** Account/password authentication is the sole entry point; the system must reject illegal access, improper operations, and the writing of erroneous data.
+ **Data Protection:** User personal information and uploaded photos must be strictly protected and not disclosed to third parties.

### 3. Availability
+ **Atomicity:** Uploading images or recipes must be an atomic operation to prevent incomplete data entry.
+ **Fault Recovery:** In the event of non-hardware failures, the system should be able to restart immediately and ensure that persisted data is not lost.

### 4. Flexibility
+ The system must exhibit high modifiability and extensibility across three levels—underlying data representation, backend interface design, and frontend layout—to adapt to future business growth.

### 5. Portability
+ Backend programs must be capable of running on all major operating systems.
+ Frontend interface programs must be compatible with common mobile terminals (e.g., Android and iOS systems).

# System Architecture Description

### 1. Infrastructure Layer

The Application Layer directly faces end-users and provides interactive functions such as recipe recognition via photo-taking, health management, community sharing, and intelligent recommendations through a mobile App interface. This layer focuses on the presentation of specific business scenarios, uses Ajax technology for asynchronous communication with the backend, converts users' raw demands (such as image uploads and text retrieval) into service requests, and displays processing results in real time, such as recipe information and personalized nutrition advice.

### 2. Support Layer

The Support Layer constructs business control logic through the Spring Boot framework, responsible for handling specific business workflows, user permission verification, and administrator review mechanisms. This layer provides a cohesive set of general services for the Application Layer, invokes underlying computing resources or data interfaces according to business requirements, and coordinates data flow and cleaning between different modules.

### 3. Application Layer

The Infrastructure Layer builds model inference services based on the Flask framework, utilizing deep learning algorithms to provide core image recognition and matrix computing capabilities. Meanwhile, this layer is responsible for the persistence and efficient retrieval of physical data, storing structured business data through MySQL and using Redis for data caching to ensure processing efficiency.