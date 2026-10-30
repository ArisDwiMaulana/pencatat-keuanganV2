use actix_web::{dev::Payload, error::ErrorUnauthorized, Error, FromRequest, HttpRequest};
use actix_session::SessionExt;
use std::future::{ready, Ready};

#[derive(Debug, Clone, Copy)]
pub struct AuthenticatedUser {
    pub user_id: i64,
}

impl FromRequest for AuthenticatedUser {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let session = req.get_session();
        match session.get::<i64>("user_id") {
            Ok(Some(user_id)) => ready(Ok(AuthenticatedUser { user_id })),
            _ => ready(Err(ErrorUnauthorized("Unauthorized: Silakan login terlebih dahulu"))),
        }
    }
}
