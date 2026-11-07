---
tracker_id: ""
id: 2
type: story
title: "Apply and refuse discount codes"
parent: epic-pricing-rules
covers: [R2]
after: [1]
refined: true
hitl: false
risk: medium
---

# Apply and refuse discount codes

## Description

Adds code validation to the pricing call and shows the refusal reason at checkout.

## Dependencies

- Story 1.3, for the tax rules the refusal message quotes.

## Requirements

1. **Valid code lowers the total** (R2)
   **Given** a cart of $50 and the code SAVE10
   **When** the shopper applies it
   **Then** the total reads $45

2. **Expired code is refused** (R2)
   **Given** an expired code
   **When** the shopper applies it
   **Then** the total is unchanged and the reason "Code expired" shows
