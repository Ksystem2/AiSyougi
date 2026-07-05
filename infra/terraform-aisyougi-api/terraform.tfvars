vpc_id = "vpc-0e90de2edaebce52f"

public_subnet_ids = [
  "subnet-0f40996eeab2d1a5f",
  "subnet-00ccad57c7b377706",
  "subnet-09ce61e45eb3451e4",
]

github_oidc_provider_arn = "arn:aws:iam::345362761619:oidc-provider/token.actions.githubusercontent.com"
github_branch            = "master"

# Set by deploy-backend.ps1 before terraform apply
container_image = "345362761619.dkr.ecr.ap-northeast-1.amazonaws.com/aisyougi-api:latest"

origin_fqdn = "origin-aisyougi-ecs.ksystemapp.com"
