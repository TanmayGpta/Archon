# Introduction
The **Beihang Campus Helper Platform** is a campus life service transaction platform developed based on the WeChat Mini Program framework. The application adopts a four-layer architectural design—comprising the Presentation Layer, Business Layer, Data Layer, and Database—to address core pain points faced by Beihang University faculty and students at the Shahe and Main campuses. These challenges include difficulties in parcel/food delivery pickup due to closed-loop management, as well as the disorganized nature and lack of searchability in campus second-hand trading information. By implementing a "Post-and-Accept" model for errand services and building a standardized second-hand marketplace, the system provides convenient life support for Beihang students, teachers, and their families.

# Core Objectives
+ **Construct a Delivery Service System:** Provide errand services for campus food and parcel pickup through a "Post-and-Accept" mechanism.
+ **Enable Instant Food Transfer:** Help users who cannot collect their food deliveries in time to perform instant transactions on the platform, reducing resource waste.
+ **Standardize Second-hand Trading:** Provide a classified, searchable environment for second-hand information, replacing disorganized chat-group trading modes.
+ **Optimize Information Retrieval Efficiency:** Improve user efficiency in obtaining valid information through multi-dimensional functions such as popular sorting, categorical search, tag matching, and time filtering.
+ **Ensure Platform Operational Security:** Establish administrative roles responsible for supervising non-compliant items, managing user information, and maintaining transaction order.

# Functional Features
### 1. Item Viewing and Searching
+ **When** a user or guest enters the main interface, the presentation layer performs the action of sorting and displaying items based on popularity rules.
+ **When** a user selects a specific category, tag, or time period, the system filters and displays the relevant item list in descending chronological order.
+ **When** a user clicks on a specific item entry, the system performs the action of navigating to the details page to display the item's location, price, and detailed description.

### 2. Order Transaction Process
+ **When** a logged-in user selects an item, enters delivery information, and submits, the system performs the actions of validating the data and inserting an order record into the database.
+ **When** an order has not yet been accepted or dispatched, the user performs the action of modifying the order notes or canceling the second-hand order.
+ **When** a user receives the item and clicks confirm on the order details page, the system performs the action of updating the order status to "Completed."

### 3. Personal Center and Favorites
+ **When** a user clicks the item favorite button, the system performs the action of adding the entry to the user's favorites list for future reference.
+ **When** a user enters the Personal Center and clicks the relevant buttons, the system performs the actions of displaying all favorited items or historical order records for that user.

### 4. Backend Management
+ **When** an administrator logs into the backend, the system performs the action of directly displaying the overall status, such as total items, delivery requests, and second-hand listings.
+ **When** an administrator discovers non-compliant content, the administrator performs the actions of modifying item information or executing a deletion after secondary confirmation.
+ **When** order maintenance is required, the administrator performs the actions of retrieving and modifying user information (such as balance or delivery address) or adjusting order details.

# Technical Constraints
+ **Mobile Platform:** Supports mobile devices running **Android 5.0** and above.
+ **Backend Framework:** Utilizes a four-layer architecture (Presentation/Business/Data/Database) and must adhere to standard Web coding specifications.
+ **Database:** Includes a data entity layer; must support **GB-level** data storage, with a recommendation of no more than **100,000 rows** per single table.
+ **Programming Language:** Developed based on the **WeChat Mini Program** framework, supporting **WeChat 8.0** and above.

# Non-Functional Requirements
+ **Processing Efficiency:** Response time during normal hours should be within **1.5 seconds**, and no more than **4 seconds** during peak periods; specific searches must return results within **3 seconds**.
+ **Security:** Requires a malicious behavior identification rate of **> 98%**; must feature **SQL injection protection** and input parameter validation; implement **Role-Based Access Control (RBAC)**.
+ **Availability:** The system must be highly reliable, capable of identifying illegal inputs, and ensuring other modules run normally during unexpected failures; supports service rollbacks, restarts, or emergency updates after a fault.
+ **Flexibility:** Functional modules must follow **decoupled design** principles with standardized documentation to ensure high maintainability.
+ **Portability:** Operates within the WeChat Mini Program environment; must be compatible with **WeChat 8.0+** and various mobile hardware configurations.

# System Architecture Description
### 1. Infrastructure Layer
Located at the top of the architecture, this layer is primarily responsible for handling the core business logic of "Beihang Bangbang". This includes managing the lifecycle of errand services (food delivery, package pickup) and second-hand items, processing order status transitions (creation, confirmation, cancellation), and presenting data in the personal center. By receiving interactive commands from the mobile terminal, the application layer translates abstract campus service requirements into structured business flows. It also handles identity switching and permission verification for various participants (sellers, customers, administrators) within specific contexts.
### 2. Support Layer
The Support Layer encapsulates complex data access operations and provides a unified invocation interface for the business logic above. Its core responsibilities include: implementing a search engine based on tags and fuzzy matching, processing request queues under high concurrency, maintaining filtering mechanisms for system security (e.g., anti-SQL injection, parameter validation), and performing automated O&M support (e.g., fault handling monitoring, log auditing). Acting as an intermediary, it ensures loose coupling between business logic and data storage, freeing upper-layer applications from concerns about the physical details of data storage.
### 3. Application Layer
Built on the WeChat Mini Program runtime environment and the Android underlying system, the Infrastructure Layer constructs an end-to-end HTTPS communication plane. This layer is not only responsible for the allocation of underlying hardware resources (e.g., CPU, memory, storage) but also provides reliable data persistence and distribution mechanisms through database management systems. Its primary goal is to provide transparent computing power and stable throughput guarantees for the upper layers, ensuring system response latency and load balancing through clusters and server operating environments.

