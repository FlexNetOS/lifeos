## ADDED Requirements

### Requirement: JSON export
The system SHALL export widget data as JSON.

#### Scenario: Successful JSON export
- **GIVEN** a user has saved widgets
- **WHEN** the user exports their widgets as JSON
- **THEN** the system provides a JSON file containing the widgets

## MODIFIED Requirements

### Requirement: Export rate limit
The system SHALL limit exports to 20 per hour.

#### Scenario: Under the limit
- **GIVEN** a user has exported 19 times this hour
- **WHEN** the user requests another export
- **THEN** the export succeeds

#### Scenario: Over the limit
- **GIVEN** a user has exported 20 times this hour
- **WHEN** the user requests another export
- **THEN** the system rejects the export with a rate-limit error

## REMOVED Requirements

### Requirement: Legacy XML export

Reason: XML format is deprecated in favor of JSON.

## RENAMED Requirements

- FROM: `### Requirement: Export filename`
- TO: `### Requirement: Exported file naming`
