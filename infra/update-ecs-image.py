import json
import os
import subprocess
import tempfile
from pathlib import Path

REGION = "ap-northeast-1"
IMAGE = os.environ.get(
    "IMAGE_URI",
    "345362761619.dkr.ecr.ap-northeast-1.amazonaws.com/aisyougi-api:latest",
)


def aws(*args: str) -> str:
    return subprocess.check_output(["aws", *args, "--region", REGION], text=True)


td = json.loads(
    aws(
        "ecs",
        "describe-task-definition",
        "--task-definition",
        "aisyougi-api-task",
        "--query",
        "taskDefinition",
        "--output",
        "json",
    )
)
for key in (
    "taskDefinitionArn",
    "revision",
    "status",
    "requiresAttributes",
    "compatibilities",
    "registeredAt",
    "registeredBy",
):
    td.pop(key, None)

td["containerDefinitions"][0]["image"] = IMAGE
reg = {
    "family": td["family"],
    "taskRoleArn": td["taskRoleArn"],
    "executionRoleArn": td["executionRoleArn"],
    "networkMode": td["networkMode"],
    "containerDefinitions": td["containerDefinitions"],
    "requiresCompatibilities": td["requiresCompatibilities"],
    "cpu": td["cpu"],
    "memory": td["memory"],
}

path = Path(tempfile.gettempdir()) / "aisyougi-task.json"
path.write_text(json.dumps(reg), encoding="utf-8")

new_arn = aws(
    "ecs",
    "register-task-definition",
    "--cli-input-json",
    f"file://{path.as_posix()}",
    "--query",
    "taskDefinition.taskDefinitionArn",
    "--output",
    "text",
).strip()
print("task", new_arn)

subprocess.check_call(
    [
        "aws",
        "ecs",
        "update-service",
        "--cluster",
        "aisyougi-api-cluster",
        "--service",
        "aisyougi-api-service",
        "--task-definition",
        new_arn,
        "--force-new-deployment",
    ]
)
print("waiting...")
subprocess.check_call(
    [
        "aws",
        "ecs",
        "wait",
        "services-stable",
        "--cluster",
        "aisyougi-api-cluster",
        "--services",
        "aisyougi-api-service",
    ]
)
print("stable")
