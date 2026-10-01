-- Compte cree directement par un Admin (sans invitation) : mot de passe provisoire a changer.
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
