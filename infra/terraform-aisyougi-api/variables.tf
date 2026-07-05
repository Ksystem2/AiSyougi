variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "name_prefix" {
  type    = string
  default = "aisyougi-api"
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "allowed_cidr_blocks" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

variable "container_image" {
  type = string
}

variable "ecr_repository_name" {
  type    = string
  default = "aisyougi-api"
}

variable "container_port" {
  type    = number
  default = 8000
}

variable "task_cpu" {
  type    = number
  default = 1024
}

variable "task_memory" {
  type    = number
  default = 2048
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "ecs_health_check_grace_period_seconds" {
  type    = number
  default = 120
}

variable "health_check_path" {
  type    = string
  default = "/api/aisyougi/health"
}

variable "app_env_vars" {
  type = map(string)
  default = {
    YANEURAOU_PATH = "/app/engine/YaneuraOu"
    YANEURAOU_CWD  = "/app/engine"
  }
}

variable "github_oidc_provider_arn" {
  type = string
}

variable "github_branch" {
  type    = string
  default = "master"
}

variable "route53_lookup_domain" {
  type    = string
  default = "ksystemapp.com"
}

variable "origin_fqdn" {
  type    = string
  default = "origin-aisyougi-ecs.ksystemapp.com"
}
