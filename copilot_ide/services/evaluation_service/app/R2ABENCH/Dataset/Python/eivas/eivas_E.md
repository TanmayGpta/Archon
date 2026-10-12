# Introduction

This project is a Web application designed for epidemiological investigation scenarios, aiming to provide comprehensive decision support for investigation personnel and developers through formatted data entry, storage, and visual correlation displays. The core value of the system lies in transforming traditional, cumbersome paper-based records into structured, multi-dimensional digital assets. This addresses key pain points such as high labor consumption, non-intuitive information display, and the difficulty of analyzing transmission chains within massive datasets. The target users primarily include frontline investigation personnel responsible for interviews and data entry, as well as professional analysts who infer infection sources and transmission chains from samples, thereby utilizing technical means to enhance the accuracy and efficiency of pandemic prevention efforts.

# Core Objectives

* Achieve formatted entry and storage of investigation information to reduce redundancy and omissions in manual records.
* Provide visualized structural information displays to assist personnel in intuitively grasping the spatial-temporal paths of cases.
* Automate the organization of correlations between cases to improve the efficiency and accuracy of transmission chain analysis.
* Aggregate pandemic statistical data to assist decision-makers in summarizing infection characteristics and formulating prevention strategies.
* Save time and human resource costs during the epidemiological investigation process.

# Functional Features

### Investigation Entry Module

* **Data Entry**: When investigation personnel conduct onsite interviews, they record basic case information, medical status, travel trajectories, and optional overseas entry information through a formatted interface.
* **Prompt Triggering**: When a patient cannot recall detailed activities in high-risk areas, the personnel can trigger prompts of recorded activity locations from the database to assist the patient's memory.
* **Path Verification**: When a patient provides imprecise location names, the personnel can select an address for the system to display on a map for visual confirmation.

### Case Management Module

* **Information Refinement**: When case information requires updates or corrections due to memory lapses or new details, personnel can edit and modify existing records through the system.
* **Information Retrieval**: When personnel need to check overall progress, the system displays all cases in a list format showing investigation completion status.
* **Filtering and Sorting**: When analysts search for specific groups, the system supports quick lookup by name, sorting by age, or filtering by gender.

### Individual Case Analysis Module

* **Path Querying**: When analysts need to study infected routes, the system displays the complete activity trajectory of a case for any selected day on a map.
* **Correlation Analysis**: When analysts set spatial and temporal thresholds, the system automatically retrieves and lists correlated case entries that meet those criteria.
* **Relationship Mapping**: When analysts need to identify close contacts, the system generates a graph showing other confirmed cases that share location co-occurrence with the subject.

### Overall Analysis Module

* **Risk Determination**: When users access the regional risk interface, the algorithm calculates risk levels based on case trajectories and generates a regional flow map.
* **Cluster Analysis**: When users access the cluster analysis section, the system aggregates cases with close proximity into a cluster map to identify potential outbreak clusters.

### Pandemic Overview Module

* **Multi-dimensional Statistics**: When analysts summarize infection characteristics, the system provides heat maps for spatial distribution, line charts for temperature/humidity trends, pie charts for age/occupation distribution, and bar charts for transportation frequency.

# Technical Constraints

The hard technical constraints for this project are as follows:

1. **Backend Framework**: The Django development framework is used.
2. **Database**: Neo4j and MongoDB are utilized for storage.
3. **Programming Language**: The project uses Python for backend programming.

# Non-Functional Requirements

1. **Processing Efficiency**: The system must support high concurrency for 100 simultaneous users with page response times under 1 second.
2. **Security**: Queries involving personal privacy must be encrypted, and a cooling period for frequent IP requests must be implemented to prevent data leaks and resource exhaustion.
3. **Availability**: The system must operate stably for long periods and possess rapid disaster recovery capabilities, switching to a backup server within 20 minutes in case of failure.
4. **Flexibility**: The code architecture should facilitate maintenance, including bug fixes, functional modifications, and the addition of new features.
5. **Portability**: The system must support cross-platform operation across various operating systems and browsers.
6. **Usability and Robustness**: The system must include ample operational prompts for grassroots staff and maintain robustness by providing feedback rather than crashing when encountering invalid input.

# System Architecture Description

### 1. Infrastructure Layer

The Infrastructure Layer serves as the foundational support of the system, primarily responsible for fundamental computing and cross-platform communication distribution. This layer provides the runtime environment via **Web Application Servers**, supporting **compatibility** across various operating systems and browsers. Its core responsibilities include ensuring system **robustness and reliability**, such as managing load capacity for concurrent requests, maintaining a rapid server switchover and deployment mechanism (within 20 minutes), and implementing security defense mechanisms including **encrypted transmission** for sensitive epidemiological data and IP access frequency limiting.

### 2. Support Layer

* **Algorithm & Analysis Engine**: Responsible for processing fragmented raw epidemiological data. It implements correlation calculations for spatial and temporal thresholds, regional risk level assessment algorithms, and case aggregation algorithms.
* **Data Access & Storage Services**: Facilitates interaction with the backend database. It manages the persistence and retrieval of formatted epidemiological forms (including basic information, travel trajectories, clinical data, and overseas entry records).
* **GIS Spatial Services**: Provides geographic information processing capabilities, converting address text into latitude and longitude coordinates while supporting path correction and visual prompts on maps.

### 3. Application Layer

The Application Layer is designed for specific business scenarios (for epidemiological investigators and analysts), completing the business closed-loop through highly integrated functional modules.

* **Epidemiological Reporting Module**: Reduces manual workload and improves accuracy through formatted input interfaces and intelligent prompts (e.g., R2 historical path search and R3 address confirmation).
* **Management & Analysis Module**: Translates complex relationships processed by the Support Layer into intuitive business insights across three dimensions: **Case Management, Individual Case Analysis, and Holistic Analysis**. This includes generating person-to-person relationship maps, regional flow charts, and cluster outbreak aggregation maps.
* **Statistical Display Module (Epidemic Overview)**: Maps abstract infectious disease characteristics into heat maps, temperature/humidity trend charts, and various distribution diagrams to directly support decision-making scenarios.