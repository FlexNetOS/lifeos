# widget-export Specification

## Purpose
Defines how users export widget data.

## Requirements

### Requirement: CSV export
The system SHALL export widget data as CSV.

#### Scenario: Successful CSV export
- **GIVEN** a user has saved widgets
- **WHEN** the user exports their widgets as CSV
- **THEN** the system provides a CSV file containing the widgets

### Requirement: Export rate limit
The system SHALL limit exports to 10 per hour.

#### Scenario: Under the limit
- **GIVEN** a user has exported 9 times this hour
- **WHEN** the user requests another export
- **THEN** the export succeeds

### Requirement: Export filename
The system SHALL include a datestamp in the exported filename.

#### Scenario: Datestamp in filename
- **GIVEN** a user exports a widget set
- **WHEN** the file is written
- **THEN** the exported file name contains today's date

### Requirement: Legacy XML export
The system SHALL export widget data as XML.

#### Scenario: Successful XML export
- **GIVEN** a user has saved widgets
- **WHEN** the user exports their widgets as XML
- **THEN** the system provides an XML file containing the widgets
