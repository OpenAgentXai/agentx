import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
import structlog

logger = structlog.get_logger()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://agentx:agentx@localhost:5432/agentx"
)

engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Initialize database connection pool."""
    logger.info("database_connected", url=DATABASE_URL.split("@")[-1])


async def close_db():
    """Close database connection pool."""
    await engine.dispose()
    logger.info("database_disconnected")


async def get_db():
    """Dependency: yield a database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
