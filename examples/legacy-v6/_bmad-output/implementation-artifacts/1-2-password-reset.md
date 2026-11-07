# Story 1.2: Password reset by email

Status: review

## Story

As a user I want to reset my password by email.

## Acceptance Criteria

1. A reset link is emailed and expires after an hour.

## Tasks / Subtasks

- [x] Task 1: Reset token (AC: #1)
  - [x] Subtask 1.1: Store hashed tokens
- [x] Task 2: Email template (AC: #1)
- [ ] [AI-Review][Medium] Expire tokens on use [auth/reset.ts:40]

## Dev Notes

- Tokens follow the auth decision. [Source: _bmad-output/planning-artifacts/architecture.md#Auth]

## Dev Agent Record

### File List
- auth/reset.ts
