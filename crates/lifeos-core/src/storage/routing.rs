use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::StorageError;

/// Append the route selected for a real dispatch to the canonical agent
/// catalog. PostgreSQL stores both the typed decision and exact raw JSON.
pub async fn append_decision(
    pool: &PgPool,
    route: &str,
    reason: &str,
    signals: Value,
    policy: Value,
    source: &str,
) -> Result<Uuid, StorageError> {
    if route.trim().is_empty()
        || reason.trim().is_empty()
        || source.trim().is_empty()
        || !signals.is_object()
        || !policy.is_object()
    {
        return Err(StorageError::InvalidRouteDecision);
    }

    sqlx::query_scalar("SELECT lifeos_agent.append_route_decision($1, $2, $3, $4, $5, $6)")
        .bind(route)
        .bind(reason)
        .bind(signals)
        .bind(policy)
        .bind(source)
        .bind(format!("lifeos:ai-route:{}", Uuid::new_v4()))
        .fetch_one(pool)
        .await
        .map_err(StorageError::from)
}
