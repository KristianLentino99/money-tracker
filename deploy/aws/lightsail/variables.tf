variable "aws_profile" {
  type    = string
  default = "default"
}

variable "aws_account_id" {
  description = "Allowed AWS account; configure in the ignored local.auto.tfvars.json file."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "A valid 12-digit AWS account ID is required."
  }
}

variable "production_domain" {
  description = "Optional domain tag; configure deployment-specific values in local.auto.tfvars.json."
  type        = string
  default     = ""
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "availability_zone" {
  type    = string
  default = "eu-central-1a"
}

variable "legacy_instance_name" {
  description = "Source instance name, supplied through ignored local configuration."
  type        = string
}

variable "instance_name" {
  description = "Target instance name, supplied through ignored local configuration."
  type        = string
}

variable "static_ip_name" {
  description = "Existing static IP resource name, supplied through ignored local configuration."
  type        = string
}

variable "backend_image_repository" {
  description = "Serving backend image repository, supplied through ignored local configuration."
  type        = string
}

variable "frontend_image_repository" {
  description = "Serving frontend image repository, supplied through ignored local configuration."
  type        = string
}

variable "retain_legacy" {
  description = "Keep the imported 2 GB source until the migrated production has passed verification."
  type        = bool
  default     = true
}

variable "adopt_existing_attachment" {
  description = "Import the initial attached IPv4; disable after adoption so recovery can recreate a detached attachment."
  type        = bool
  default     = true
}

variable "active_instance" {
  description = "Production IPv4 routing: legacy while staging; candidate after data transfer."
  type        = string
  default     = "legacy"

  validation {
    condition     = contains(["legacy", "candidate"], var.active_instance)
    error_message = "active_instance must be legacy or candidate."
  }
}
