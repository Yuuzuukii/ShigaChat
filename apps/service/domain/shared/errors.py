class DomainError(Exception):
    """Base class for domain/application errors."""


class NotFoundError(DomainError):
    pass


class PermissionDeniedError(DomainError):
    pass


class ValidationError(DomainError):
    pass


class ConflictError(DomainError):
    pass
