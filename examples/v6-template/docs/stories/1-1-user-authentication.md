# Story 1.1: User Authentication

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a plant owner,
I want to sign up and sign in,
so that my plants are saved to my account.

## Acceptance Criteria

1. Signing up with a valid email and password creates an account and signs me in.

## Tasks / Subtasks

- [x] Task 1 (AC: #1)
  - [x] Subtask 1.1: Users table with hashed passwords
- [x] Task 2 (AC: #1)
  - [x] Subtask 2.1: Session cookie

## Dev Notes

- Sessions follow the architecture's auth section.

### Project Structure Notes

- Auth lives in `src/auth/`.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Auth]

## Dev Agent Record

### Agent Model Used

dev-agent

### Debug Log References

### Completion Notes List

- Signed in after sign-up, as the AC says.

### File List

- src/auth/signup.ts
