# Parks Connect

## System Name
**Parks Connect**  
A centralized digital platform for ZimParks operations, visitor management, environmental reporting, tourism feedback, alerts, and analytics.

## Merged Problem Statement
Zimbabwe's national parks and community tourism areas currently operate without a fully centralized and integrated system for tracking visitors, monitoring environmental conditions, managing infrastructure, or collecting stakeholder feedback. In practice, this creates fragmented workflows across park gates, tourism facilities, field operations, and headquarters, making it difficult for the Zimbabwe Parks and Wildlife Management Authority to make timely, data-driven decisions and to respond proactively to operational and conservation challenges.

Visitor data collection has traditionally depended on manual registers, spreadsheets, and isolated park-level recordkeeping. These methods are neither standardized nor integrated, which weakens revenue visibility, slows reconciliation, and limits real-time oversight. According to the user-provided study draft, ZimParks annual reports for 2020-2022 indicate discrepancies between collected revenue and reported figures averaging 8-12%, suggesting weaknesses in existing tracking mechanisms.

Environmental monitoring also tends to occur through disconnected departmental processes. Wildlife observations, water levels, vegetation conditions, waste incidents, and field reports are often stored in separate records, preventing a unified view of ecosystem health and limiting the ability to detect patterns early. This weakens adaptive conservation management, especially in situations involving drought conditions, disease outbreaks, human-wildlife conflict, or infrastructure failure.

Tourist and stakeholder feedback remains similarly fragmented. In many cases, feedback is captured through comment books, informal complaints, or non-standard manual channels. This results in poor issue visibility, limited accountability, and no reliable mechanism for tracking whether reported concerns are resolved. As reflected in the user-provided draft, a Tourism Business Council of Zimbabwe survey (2021) found that while many tourists experienced infrastructure-related issues, only a small proportion reported them through official channels because convenient reporting tools were absent.

Infrastructure maintenance also remains largely reactive. Requests often move slowly through administrative channels, creating delays in repairs, reducing visitor satisfaction, and affecting tourism revenue. Earlier attempts to improve operations through quarterly reporting and isolated digital pilots showed potential, but they were limited by lack of integration, slow reporting cycles, inconsistent formats, and insufficient system-wide rollout.

Parks Connect addresses this problem by providing one integrated web and mobile platform that centralizes operational data, environmental reporting, tourist feedback, analytics, and alerting. The system is designed to support real-time data capture, centralized monitoring, faster response workflows, and better management visibility across all relevant stakeholders.

## Proposed Solution
Parks Connect provides one integrated web and mobile system that allows ZimParks to collect, manage, analyze, and act on park data from a single platform. It supports field reporting, dashboard monitoring, visitor logging, feedback management, alert generation, and role-based access for different users.

## Study Objectives
The study seeks to achieve the following objectives:

1. To design and develop a centralized web and mobile platform.
2. To create an integrated environmental and wildlife monitoring module.
3. To implement a multi-channel tourist feedback system incorporating mobile applications, web interfaces, and SMS capabilities.
4. To develop a centralized analytics dashboard for ZimParks management.
5. To establish an automated notification and alert system that detects critical conditions such as drought indicators, infrastructure failures, security incidents, and/or capacity thresholds.

## Objective Achievement Mapping

### Objective 1: Centralized Web and Mobile Platform
**Status:** Achieved

**Where this was achieved**
- A role-based **web portal** was developed for administrators, environment officers, and tourism operators.
- A **Flutter mobile app** was integrated with the hosted backend API for field and public workflows.
- A centralized **backend API** and **PostgreSQL database** were deployed to support both web and mobile clients from one data source.

**Implemented system areas**
- Web authentication and dashboards
- Hosted backend API
- Mobile integration using `API_BASE`
- Shared centralized database and role-based access

### Objective 2: Integrated Environmental and Wildlife Monitoring Module
**Status:** Achieved

**Where this was achieved**
- Environmental logging was implemented for categories such as wildlife, water, waste, and incident reporting.
- Field officers can submit environmental records with severity, status, location coordinates, and optional images.
- The system supports park-level monitoring, incident visibility, and environmental summaries through the dashboard and analytics flow.

**Implemented system areas**
- Environmental log capture
- Incident reporting
- Severity and workflow status tracking
- GPS-supported field submissions
- Dashboard summaries for environmental conditions

### Objective 3: Multi-Channel Tourist Feedback System
**Status:** Partially Achieved

**Where this was achieved**
- Tourist and stakeholder feedback can be submitted through the **web interface** and the **mobile app**.
- Feedback is structured with ratings, comments, park association, workflow status, and issue visibility.
- Operator feedback is also supported through the system.

**Current limitation**
- **SMS capability is not implemented in the current version.**

**Implemented system areas**
- Public/mobile feedback submission
- Web-based feedback workflows
- Feedback tracking and management
- Status updates for feedback items

### Objective 4: Centralized Analytics Dashboard
**Status:** Achieved

**Where this was achieved**
- A centralized dashboard was developed for management and operational users.
- The system provides summary metrics for visitors, occupancy, ratings, environmental conditions, notifications, and park-level activity.
- Exportable reporting is supported through CSV and PDF outputs.

**Implemented system areas**
- Authority dashboard
- Environment officer dashboard
- Tourism operator dashboard
- Analytics summaries and performance views
- CSV and PDF report generation

### Objective 5: Automated Notification and Alert System
**Status:** Achieved

**Where this was achieved**
- The system generates alerts automatically when thresholds or critical conditions are detected.
- Alerts are created for cases such as high visitor pressure, low ratings, high-severity incidents, environmental issues, and escalation workflow breaches.
- Notifications are surfaced in the dashboard and through backend alert logic.

**Implemented system areas**
- Threshold-based alert creation
- Severity-based notification logic
- Workflow escalation support
- Dashboard notification stream

## Main Features of the System

### 1. User Authentication and Access Control
- Secure login for system users
- Role-based access for different user types
- Session-based web authentication
- JWT-based API authentication for mobile and backend integrations

### 2. Role-Based Portals
- **Authority Admin**
  - Full system oversight
  - Park and user management
  - Reports and thresholds
  - National analytics dashboard
- **Environment Officer**
  - Environmental log capture
  - Incident reporting and park-level monitoring
  - Feedback review and response support
- **Tourism Operator**
  - Visitor logging
  - Occupancy reporting
  - Operational feedback submission
- **Tourist / Public**
  - Mobile/public feedback submission
  - Incident and issue reporting with optional photos

### 3. Park Management
- Park listing and assignment management
- Park-based access restrictions
- Park-level thresholds for alerts and monitoring

### 4. Visitor and Occupancy Logging
- Daily visitor recording
- Local and international visitor tracking
- Occupancy and accommodation utilization tracking
- Park performance reporting

### 5. Environmental and Incident Reporting
- Environmental log capture
- Wildlife, water, waste, and incident categories
- Severity and workflow status tracking
- GPS-based location support
- Duplicate incident detection for mobile submissions

### 6. Feedback Management
- Tourist and operator feedback submission
- Ratings and comments tracking
- Workflow statuses such as new, assigned, in progress, resolved, and escalated
- Park-specific issue visibility

### 7. Alerts and Notifications
- Automatic alert generation from thresholds
- Rating drop alerts
- High-severity incident alerts
- Visitor and occupancy threshold alerts
- Notification stream for active issues

### 8. Analytics and Reporting
- Summary dashboards by role
- Park performance insights
- Visitor and occupancy trends
- Environmental status summaries
- Exportable CSV and PDF reports

### 9. Mobile Support
- Mobile app integration with the hosted backend API
- Support for field submissions from officers and visitors
- Offline-friendly local capture flow with sync-oriented structure

## Target Users
- ZimParks headquarters administrators
- Environmental officers and field teams
- Tourism operators
- Analysts and decision makers
- Tourists and members of the public

## Technology Stack
- **Frontend Web:** Express, EJS, Tailwind/CSS
- **Backend API:** Node.js, Express
- **Database:** PostgreSQL (Supabase)
- **Mobile App:** Flutter
- **Authentication:** Sessions for web, JWT for API
- **Hosting:** Vercel

## System Components
- **Web Portal** for administration, dashboards, reports, and monitoring
- **Backend API** for business logic, authentication, analytics, and mobile integration
- **Mobile App** for field reporting, feedback, and incident capture
- **Database Layer** for centralized data storage and retrieval

## Key Benefits
- Faster reporting from parks and field staff
- Improved visibility across parks and departments
- Better response to incidents and environmental issues
- Stronger tourism and visitor data tracking
- Centralized decision support for ZimParks management

## Conclusion
Parks Connect is a practical digital management system designed to support ZimParks with centralized operations, real-time reporting, role-based access, and actionable analytics. Against the stated study objectives, the current implementation fully achieves the centralized platform, environmental monitoring, analytics dashboard, and automated alert objectives, while the multi-channel feedback objective is **partially achieved** because SMS support has not yet been implemented.
