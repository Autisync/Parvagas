"""Custom exception and error handling."""
from fastapi import HTTPException, status


class ParavagasException(HTTPException):
    """Base exception for Parvagas."""
    
    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(status_code=status_code, detail=detail)


class AuthenticationError(ParavagasException):
    """Authentication failed."""
    
    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(detail, status.HTTP_401_UNAUTHORIZED)


class AuthorizationError(ParavagasException):
    """User not authorized to perform action."""
    
    def __init__(self, detail: str = "Not authorized"):
        super().__init__(detail, status.HTTP_403_FORBIDDEN)


class NotFoundError(ParavagasException):
    """Resource not found."""
    
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(detail, status.HTTP_404_NOT_FOUND)


class ConflictError(ParavagasException):
    """Resource already exists."""
    
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(detail, status.HTTP_409_CONFLICT)


class ValidationError(ParavagasException):
    """Validation failed."""
    
    def __init__(self, detail: str = "Validation failed"):
        super().__init__(detail, status.HTTP_422_UNPROCESSABLE_ENTITY)


class EmailNotVerifiedError(ParavagasException):
    """Email not verified."""
    
    def __init__(self):
        super().__init__("Please verify your email before signing in", status.HTTP_403_FORBIDDEN)
