"""Shared UTC timestamps for reproducible planning-spine generators."""

from __future__ import annotations

import os
from datetime import datetime, timezone


def utc_now() -> str:
    """Return UTC now, or SOURCE_DATE_EPOCH when reproducibility is requested."""
    raw_epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if raw_epoch is None:
        value = datetime.now(timezone.utc)
    else:
        try:
            epoch = int(raw_epoch)
        except ValueError as error:
            raise ValueError("SOURCE_DATE_EPOCH must be an integer Unix timestamp") from error
        if epoch < 0:
            raise ValueError("SOURCE_DATE_EPOCH must be non-negative")
        value = datetime.fromtimestamp(epoch, timezone.utc)
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")
