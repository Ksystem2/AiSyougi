output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  value = aws_ecs_service.this.name
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "origin_fqdn" {
  value = var.origin_fqdn
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}
