---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: ["_bmad-output/planning-artifacts/prd.md"]
---

# My Awesome Project - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for My Awesome Project, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: People can sign up and sign in.
FR2: People can track their plants.

### FR Coverage Map

FR1: Epic 1
FR2: Epic 1, Epic 2

## Epic List

1. Accounts and plants
2. Plant personalities

<!-- Repeat for each epic in epics_list (N = 1, 2, 3...) -->

## Epic 1: Accounts and plants

People can sign up, manage their account and add the plants they own.

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story 1.1: User Authentication

As a plant owner,
I want to sign up and sign in,
So that my plants are saved to my account.

**Acceptance Criteria:**

**Given** the sign-up form
**When** I submit a valid email and password
**Then** my account is created
**And** I am signed in

### Story 1.2: Account Management

As a plant owner,
I want to change my email and password,
So that my account stays mine.

**Acceptance Criteria:**

**Given** I am signed in
**When** I change my password
**Then** the old one stops working

### Story 1.3: Plant Data Model

As a developer,
I want a plant record with species, location and watering schedule,
So that every feature reads plants the same way.

**Acceptance Criteria:**

**Given** a new plant
**When** it is saved
**Then** species, location and schedule are stored

### Story 1.4: Add Plant Manual

As a plant owner,
I want to add a plant by typing its details,
So that I can track plants the camera doesn't recognise.

**Acceptance Criteria:**

**Given** the add-plant form
**When** I enter a species and location
**Then** the plant appears in my list

<!-- End story repeat -->

## Epic 2: Plant personalities

Each plant talks back, so care feels like a conversation.

### Story 2.1: Personality System

As a plant owner,
I want each plant to have a personality,
So that caring for it is fun.

**Acceptance Criteria:**

**Given** a plant
**When** it is created
**Then** it gets a personality from its species

### Story 2.2: Chat Interface

As a plant owner,
I want to chat with a plant,
So that I can ask how it is doing.

**Acceptance Criteria:**

**Given** a plant's page
**When** I send a message
**Then** the plant answers in its personality

### Story 2.3: LLM Integration

As a developer,
I want the chat to call the model with the plant's state,
So that answers reflect real watering data.

**Acceptance Criteria:**

**Given** a chat message
**When** the model answers
**Then** the answer cites the plant's last watering
