import json
from pathlib import Path
import shlex
import sys
import tempfile
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parent))
import migrate  # noqa: E402


class FakeResult:
    def __init__(self, *, stdout=b"", returncode=0):
        self.stdout = stdout
        self.returncode = returncode


class MigrateSafeguardTests(unittest.TestCase):
    def test_load_context_uses_configured_identity_and_rejects_wrong_account(self):
        context = {
            "source": "synthetic-source",
            "target": "synthetic-target",
            "profile": "synthetic-profile",
            "region": "synthetic-region",
            "static_ip": "synthetic-static-ip",
            "account": "expected-account",
            "backend_image": "registry.example/backend:synthetic",
            "frontend_image": "registry.example/frontend:synthetic",
        }
        calls = []

        def fake_run(*, command, **kwargs):
            calls.append((command, kwargs))
            if command[0] == "terraform":
                return FakeResult(stdout=json.dumps(json.dumps(context)).encode())
            return FakeResult(stdout=json.dumps({"Account": "wrong-account"}).encode())

        with patch.multiple(
            migrate,
            SOURCE="original-source",
            TARGET="original-target",
            PROFILE="original-profile",
            REGION="original-region",
            STATIC_IP="original-static-ip",
            COMPOSE="original-compose",
        ), patch.object(migrate, "run", side_effect=fake_run):
            with self.assertRaisesRegex(RuntimeError, "does not match the Terraform account restriction"):
                migrate.load_context()
            configured_compose = migrate.COMPOSE

        self.assertEqual(
            configured_compose,
            migrate.COMPOSE_TEMPLATE.format(
                backend=shlex.quote(context["backend_image"]),
                frontend=shlex.quote(context["frontend_image"]),
            ),
        )

        self.assertEqual(len(calls), 2)
        console_command, console_kwargs = calls[0]
        self.assertEqual(console_command[0], "terraform")
        self.assertIn(b"nonsensitive(var.aws_account_id)", console_kwargs["stdin"])
        self.assertEqual(
            calls[1][0],
            [
                "aws",
                "--profile",
                "synthetic-profile",
                "--region",
                "synthetic-region",
                "sts",
                "get-caller-identity",
                "--output",
                "json",
            ],
        )

    def test_terraform_rejects_unexpected_plan_before_apply(self):
        plan_data = {
            "resource_changes": [
                {
                    "address": "aws_lightsail_instance.candidate",
                    "change": {"actions": ["delete"]},
                }
            ]
        }
        calls = []

        def fake_run(*, command, **_kwargs):
            calls.append(command)
            if "show" in command:
                return FakeResult(stdout=json.dumps(plan_data).encode())
            for argument in command:
                if argument.startswith("-out="):
                    Path(argument.removeprefix("-out=")).touch()
            return FakeResult(stdout=b"plan output")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "root"
            private = root / "private"
            private.mkdir(parents=True)
            with patch.object(migrate, "ROOT", root), patch.object(migrate, "PRIVATE", private), patch.object(
                migrate, "run", side_effect=fake_run
            ):
                with self.assertRaisesRegex(RuntimeError, "Unexpected Terraform action"):
                    migrate.terraform(phase="stage")

        self.assertFalse(any("apply" in command for command in calls))

    def test_failed_source_stop_still_resumes_source_for_stage(self):
        calls = []

        def fake_ssh(*, address, command, key, check=True):
            calls.append((address, command, key, check))
            if len(calls) == 1:
                raise RuntimeError("source compose stop failed")
            return FakeResult()

        with patch.object(migrate, "check_bank_queue") as mocked_check_bank_queue, patch.object(
            migrate, "ssh", side_effect=fake_ssh
        ):
            with self.assertRaisesRegex(RuntimeError, "source compose stop failed"):
                migrate.copy_data(
                    source_address="source",
                    target_address="target",
                    key=Path("key"),
                    details={"volumes": ["budget-tracker-prod_postgres"]},
                    phase="stage",
                    restart_source=True,
                )

        self.assertEqual(len(calls), 2)
        self.assertIn("docker compose", calls[0][1])
        self.assertIn("stop --timeout 60", calls[0][1])
        self.assertIn("up -d --no-build --pull never", calls[1][1])
        mocked_check_bank_queue.assert_called_once()

    def test_pending_bank_queue_refuses_copy(self):
        with patch.object(migrate, "ssh", return_value=FakeResult(stdout=b"0\n1\n0\n0\n")) as mocked_ssh:
            with self.assertRaisesRegex(RuntimeError, "Bank sync work is pending/active"):
                migrate.check_bank_queue(address="source", key=Path("key"))

        mocked_ssh.assert_called_once()

    def test_validate_transfer_rejects_altered_volume_manifest(self):
        expected_volumes = [f"budget-tracker-prod_volume_{index}" for index in range(5)]
        details = {
            "release": "a" * 40,
            "images": [f"image-{index}" for index in range(6)],
            "volumes": expected_volumes,
        }
        altered_source = {**details, "volumes": [*expected_volumes[:-1], "budget-tracker-prod_stale"]}
        matching_target = {**details}

        with patch.object(migrate, "manifest", side_effect=[altered_source, matching_target]) as mocked_manifest:
            with self.assertRaisesRegex(RuntimeError, "Transfer identity mismatch: volumes"):
                migrate.validate_transfer(details=details, source_address="source", target_address="target", key=Path("key"))

        self.assertEqual(mocked_manifest.call_count, 2)

    def test_missing_captured_keys_block_routing_before_terraform(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "root"
            private = root / "private"
            private.mkdir(parents=True)
            with patch.object(migrate, "ROOT", root), patch.object(migrate, "PRIVATE", private), patch.object(
                migrate, "run"
            ) as mocked_run:
                with self.assertRaisesRegex(RuntimeError, "Captured host keys are required"):
                    migrate.terraform(phase="cutover")

        mocked_run.assert_not_called()

    def test_recover_service_starts_fallback_before_recovery_attachment(self):
        aws_results = [
            {"staticIp": {"attachedTo": None}},
            {"staticIp": {"attachedTo": migrate.SOURCE}},
        ]
        host_results = ["source-ip", "source-ip"]
        ssh_calls = []
        ready_calls = []

        def fake_ssh(*, address, command, key, check=True):
            ssh_calls.append((address, command, key, check))
            return FakeResult()

        def fake_host(*, name):
            self.assertEqual(name, migrate.SOURCE)
            return host_results.pop(0)

        def fake_wait_for_stack(*, address, key):
            ready_calls.append((address, key))

        with patch.object(migrate, "aws", side_effect=aws_results) as mocked_aws, patch.object(
            migrate, "host", side_effect=fake_host
        ), patch.object(migrate, "ssh", side_effect=fake_ssh), patch.object(
            migrate, "wait_for_stack", side_effect=fake_wait_for_stack
        ), patch.object(migrate, "terraform") as mocked_terraform, patch.object(
            migrate, "pin_route_host_key"
        ) as mocked_pin_route_host_key, patch.object(migrate, "seed_aws_host_key") as mocked_seed_aws_host_key:
            migrate.recover_service(key=Path("key"), fallback=migrate.SOURCE)

        mocked_terraform.assert_called_once_with(phase="recover-source")
        mocked_pin_route_host_key.assert_called_once()
        mocked_seed_aws_host_key.assert_called_once_with(name=migrate.SOURCE, address="source-ip")
        self.assertEqual(mocked_aws.call_count, 2)
        self.assertEqual(ready_calls, [("source-ip", Path("key")), ("source-ip", Path("key"))])
        self.assertEqual(len(ssh_calls), 2)
        self.assertIn("up -d --no-build --pull never", ssh_calls[0][1])
        self.assertIn("up -d --no-build --pull never", ssh_calls[1][1])

    def test_recovery_terraform_allows_only_attachment_create_or_replace(self):
        def run_plan(*, actions, address="aws_lightsail_static_ip_attachment.production"):
            calls = []
            plan_data = {"resource_changes": [{"address": address, "change": {"actions": actions}}]}

            def fake_run(*, command, **_kwargs):
                calls.append(command)
                if "show" in command:
                    return FakeResult(stdout=json.dumps(plan_data).encode())
                for argument in command:
                    if argument.startswith("-out="):
                        Path(argument.removeprefix("-out=")).touch()
                return FakeResult(stdout=b"plan output")

            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / "root"
                private = root / "private"
                private.mkdir(parents=True)
                with patch.object(migrate, "ROOT", root), patch.object(migrate, "PRIVATE", private), patch.object(
                    migrate, "run", side_effect=fake_run
                ), patch.object(migrate, "pin_route_host_key"):
                    error = None
                    try:
                        migrate.terraform(phase="recover-source")
                    except RuntimeError as caught:
                        error = caught
            return calls, error

        for actions in (["create"], ["delete", "create"]):
            calls, error = run_plan(actions=actions)
            self.assertIsNone(error)
            self.assertTrue(any("apply" in command for command in calls))

        calls, error = run_plan(actions=["create"], address="aws_lightsail_instance.candidate")
        self.assertIsNotNone(error)
        self.assertIn("Unexpected Terraform action", str(error))
        self.assertFalse(any("apply" in command for command in calls))

    def test_source_backup_download_failure_resumes_source(self):
        calls = []

        def fake_ssh(*, address, command, key, check=True):
            calls.append((address, command, key, check))
            return FakeResult()

        with patch.object(migrate, "check_bank_queue") as mocked_check_bank_queue, patch.object(
            migrate, "ssh", side_effect=fake_ssh
        ), patch.object(migrate, "download", side_effect=RuntimeError("source volume backup failed")) as mocked_download:
            with self.assertRaisesRegex(RuntimeError, "source volume backup failed"):
                migrate.copy_data(
                    source_address="source",
                    target_address="target",
                    key=Path("key"),
                    details={"volumes": ["budget-tracker-prod_postgres"]},
                    phase="stage",
                    restart_source=True,
                )

        mocked_download.assert_called_once()
        self.assertEqual(len(calls), 3)
        self.assertIn("frontend backend", calls[0][1])
        self.assertIn("stop --timeout 60", calls[1][1])
        self.assertIn("up -d --no-build --pull never", calls[2][1])
        self.assertEqual(mocked_check_bank_queue.call_count, 2)


if __name__ == "__main__":
    unittest.main()
