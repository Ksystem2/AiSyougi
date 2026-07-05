terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "ksystemapp-web-production"
    key    = "aisyougi/terraform/ecs-api.tfstate"
    region = "ap-northeast-1"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "aisyougi"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_route53_zone" "parent" {
  count = trimspace(var.route53_lookup_domain) != "" ? 1 : 0

  name         = trimsuffix(trimspace(var.route53_lookup_domain), ".")
  private_zone = false
}

locals {
  app_name = var.name_prefix
  tags = {
    Project     = "aisyougi"
    Environment = "production"
    ManagedBy   = "terraform"
  }
  route53_zone_id = length(data.aws_route53_zone.parent) > 0 ? data.aws_route53_zone.parent[0].zone_id : ""
  origin_label    = trimsuffix(trimsuffix(var.origin_fqdn, "."), ".${trimsuffix(data.aws_route53_zone.parent[0].name, ".")}")
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.app_name}"
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_ecr_repository" "api" {
  name                 = var.ecr_repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.tags
}

resource "aws_ecs_cluster" "this" {
  name = "${local.app_name}-cluster"
  tags = local.tags
}

resource "aws_security_group" "alb" {
  name        = "${local.app_name}-alb-sg"
  description = "Allow inbound web traffic"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_security_group" "ecs_service" {
  name        = "${local.app_name}-ecs-sg"
  description = "Allow inbound from ALB only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_lb" "this" {
  name               = "${local.app_name}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  idle_timeout       = 120
  tags               = local.tags
}

resource "aws_lb_target_group" "this" {
  name        = "${local.app_name}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path                = var.health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 5
    interval            = 30
    timeout             = 10
    matcher             = "200-399"
  }

  tags = local.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.app_name}-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

resource "aws_iam_role_policy_attachment" "execution_base" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name               = "${local.app_name}-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:Ksystem2/AiSyougi:ref:refs/heads/${var.github_branch}",
        "repo:Ksystem2/AiSyougi:ref:refs/heads/main",
        "repo:Ksystem2/AiSyougi:ref:refs/heads/master",
      ]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${local.app_name}-github-actions-deploy-role"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json
  tags               = local.tags
}

data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid    = "TerraformAndEcsDeploy"
    effect = "Allow"
    actions = [
      "ecs:*",
      "ecr:*",
      "elasticloadbalancing:*",
      "ec2:Describe*",
      "logs:*",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:CreateRole",
      "iam:TagRole",
      "iam:DeleteRole",
      "iam:PassRole",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "route53:GetChange",
      "route53:ListHostedZones",
      "route53:GetHostedZone",
      "route53:ListResourceRecordSets",
      "route53:ChangeResourceRecordSets",
      "cloudfront:CreateInvalidation",
      "cloudfront:GetDistribution",
      "cloudfront:UpdateDistribution",
      "cloudfront:ListFunctions",
      "cloudfront:DescribeFunction",
      "cloudfront:CreateFunction",
      "cloudfront:UpdateFunction",
      "cloudfront:PublishFunction",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "TerraformStateS3Access"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "arn:aws:s3:::ksystemapp-web-production",
      "arn:aws:s3:::ksystemapp-web-production/*",
    ]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "${local.app_name}-github-actions-deploy-policy"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${local.app_name}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.container_image
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        for k in sort(keys(var.app_env_vars)) : {
          name  = k
          value = var.app_env_vars[k]
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_service" "this" {
  name                              = "${local.app_name}-service"
  cluster                         = aws_ecs_cluster.this.id
  task_definition                 = aws_ecs_task_definition.this.arn
  desired_count                   = var.desired_count
  launch_type                     = "FARGATE"
  health_check_grace_period_seconds = var.ecs_health_check_grace_period_seconds

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [aws_security_group.ecs_service.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = "api"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.http]
  tags       = local.tags
}

resource "aws_route53_record" "origin_alias" {
  count           = local.route53_zone_id != "" ? 1 : 0
  zone_id         = local.route53_zone_id
  name            = local.origin_label
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
