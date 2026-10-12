# Introduction

MyTorch is a visual deep learning framework system designed for neural network beginners and non-professional developers. Built as an enhancement of the lightweight NNEngine framework, the application integrates core functionalities including model configuration, data loading, model training, and task inference. It aims to address the pain points where mainstream deep learning frameworks (such as TensorFlow and PyTorch) often overwhelm beginners with their functional complexity, steep learning curves, and high computational resource requirements. By providing an intuitive graphical user interface and automated resource management (such as GPU acceleration APIs), the system allows users to complete the entire pipeline from model construction to inference deployment without writing complex code, thereby offering a simple, easy-to-use, and fully-featured practice platform for deep learning learners.

# Core Objectives

* **Functional Enhancement and Extension**: Introduce additional model weight initialization methods, classic model architectures (e.g., ResNet, VGG, Transformer), and built-in datasets (e.g., ImageNet, COCO) on top of the original lightweight framework to improve flexibility and application scope.

* **Computational Performance Optimization**: Implement GPU acceleration to enhance the efficiency of processing compute-intensive tasks through parallel computing, significantly reducing training time for large models and datasets.

* **Low-Barrier Visual Operations**: Develop intuitive front-end interfaces (including configuration, training, and inference screens) that enable users to manage models and parameters through graphical operations instead of coding.

* **Closed-Loop Lifecycle Management**: Achieve persistence for model initialization, training logs, inference history, and model management through the linkage between the backend and the database, ensuring system stability and traceability.

* **Pedagogy and Principle Popularization**: Help beginners intuitively understand the construction and optimization process of neural networks through real-time feedback and visualization of the training process, such as loss curves and accuracy changes.

# Functional Features

### 1. Model Configuration Module

* When a user chooses to **define a new model**, the **Front-end System** provides built-in modules for the user to construct the model structure graphically.


* When a user completes the **model structure adjustment**, the **System** automatically configures and associates the corresponding loss functions.


* When the **model configuration is successful**, the **Backend Module** stores the configured model information into the database and sends a success notification to the user.

### 2. Data Loading Module

* When a user needs to **prepare training data**, the **User** can select from the system's pre-deployed internal datasets (e.g., CIFAR-10, SVHN) or custom data.


* When a user **defines the data loading method**, the **System** allows the user to configure data preprocessing methods, data augmentation strategies, and dataset splitting ratios.

### 3. Model Training Module

* When a user is about to **start model training**, the **User** defines hyperparameters (e.g., batch size, learning rate), optimizer types, and training stop conditions through the configuration interface.
* When a user **executes training instructions**, the **System** allows the user to specify the computation mode (using CPU or utilizing GPU acceleration).
* When a **training task is running**, the **System** pushes real-time assessment results like loss values and accuracy to the front-end and automatically saves the current optimal model based on the configuration.
* When an **exception such as gradient explosion** occurs, the **System Fault Handling Mechanism** automatically terminates the training process to prevent model collapse.

### 4. Model Inference Module

* When a user selects an **image classification task**, the **User** uploads a single image, and the **System** returns the prediction result by calling the model's `forward()` method.
* When a user executes a **model performance test**, the **Inference Engine** loads the model from a specified path, matches it with the test set, and displays overall evaluation metrics on the interface.

# Technical Constraints

1. **Mobile Platforms**: The operating environment is specified as computer devices that support a Python environment.
2. **Backend Framework**: Based on the enhancement and secondary development of the original small-scale deep learning framework **NNEngine**.
3. **Database**: Uses **SQLite** for local persistent storage, featuring an automatic backup mechanism.
4. **Programming Language**: The system is implemented using **Python 3.8.x** or higher.
5. **Hardware Constraints**: GPU acceleration requires **NVIDIA GPUs** that support **CUDA** with a computing capability greater than 3.0.

# Non-Functional Requirements

* **Processing Efficiency**: The average response time of the interface to user interaction commands should be less than 0.75s, and the average response time of the training engine to user instructions should be less than 2.5s.
* **Security**: The system must have necessary security and privacy protection mechanisms to guard against potential vulnerability attacks and ensure the confidentiality and integrity of user models and data.
* **Availability**: The system should include runtime exception monitoring (e.g., memory overflow monitoring) and support manual or automatic data recovery via backup files in the event of hardware failure or database errors.
* **Flexibility/Scalability**: The system should support user extensions for custom models and datasets; GPU acceleration must be implemented via easy-to-use APIs to ensure high compatibility with the original framework for future expansion.

# System Architecture Description

The MyTorch system employs a clear vertical layered architecture, enabling end-to-end support for deep learning tasks through inter-layer collaboration.

### 1. **Application Layer**

This layer directly serves end-users (primarily deep learning beginners) by providing business logic encapsulation through a **visual front-end interface**. It is responsible for handling specific business scenarios, including graphical configuration of model structures, interactive setting of training hyperparameters, path mapping for datasets, and triggering inference tasks. This layer abstracts the complex process of neural network construction into an intuitive operational workflow. It is independent of specific low-level computational details and focuses on fulfilling user intent and providing real-time visual feedback of results.

### 2. **Support Layer**

This layer serves a core bridging and general service integration function. It primarily consists of the **system back-end service** and **data persistence module**. The support layer responds to requests from the application layer via standardized APIs, scheduling underlying computational resources to complete tasks such as model initialization, training iterations, and inference calculations. Simultaneously, it provides cohesive general support services, such as SQLite-based persistence of training/inference logs, management of dataset loader preprocessing, and model weight initialization strategies. This shields the application layer from the complexities of invoking the underlying frameworks.

### 3. **Infrastructure Layer**

This layer is the system's underlying engine (an extended version of NNEngine), built upon fundamental **computation, communication, and distribution mechanisms**. It not only contains the logic for neural network forward/backward propagation but also interacts directly with hardware resources through integrated **GPU acceleration modules** (e.g., CUDA parallel computing functions) to provide efficient matrix operation support. The infrastructure layer comes pre-equipped with classical model architectures (such as ResNet and Transformer) and standard dataset interfaces. Serving as atomic capabilities independent of specific business scenarios, it provides the entire system with the most fundamental computational power support and data distribution guarantees.