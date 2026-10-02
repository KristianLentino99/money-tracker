locals {
  tags = merge({
    Project     = "money-tracker"
    Environment = "production"
  }, var.production_domain == "" ? {} : { Domain = var.production_domain })
}

import {
  for_each = var.retain_legacy ? { source = var.legacy_instance_name } : {}
  to       = aws_lightsail_instance.legacy[0]
  id       = each.value
}

import {
  to = aws_lightsail_static_ip.production
  id = var.static_ip_name
}

import {
  for_each = var.adopt_existing_attachment ? { production = var.static_ip_name } : {}
  to       = aws_lightsail_static_ip_attachment.production
  id       = each.value
}

resource "aws_lightsail_instance" "legacy" {
  count             = var.retain_legacy ? 1 : 0
  name              = var.legacy_instance_name
  availability_zone = var.availability_zone
  blueprint_id      = "ubuntu_24_04"
  bundle_id         = "small_3_0"
  key_pair_name     = "LightsailDefaultKeyPair"
  ip_address_type   = "dualstack"

  lifecycle {
    # Import the rollback source without modifying its running configuration.
    ignore_changes = all
  }
}

resource "aws_lightsail_instance" "candidate" {
  name              = var.instance_name
  availability_zone = var.availability_zone
  blueprint_id      = "ubuntu_24_04"
  bundle_id         = "micro_3_0"
  key_pair_name     = "LightsailDefaultKeyPair"
  ip_address_type   = "dualstack"
  user_data         = file("${path.module}/bootstrap-host.sh")
  tags              = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lightsail_static_ip" "production" {
  name = var.static_ip_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lightsail_static_ip_attachment" "production" {
  static_ip_name = aws_lightsail_static_ip.production.name
  instance_name  = var.active_instance == "candidate" ? aws_lightsail_instance.candidate.name : var.legacy_instance_name

  lifecycle {
    precondition {
      condition     = var.retain_legacy || var.active_instance == "candidate"
      error_message = "The source cannot be retired while production IPv4 still routes to it."
    }
  }
}

resource "aws_lightsail_instance_public_ports" "candidate" {
  instance_name = aws_lightsail_instance.candidate.name

  dynamic "port_info" {
    for_each = toset([22, 80, 443])
    content {
      from_port  = port_info.value
      to_port    = port_info.value
      protocol   = "tcp"
      cidrs      = ["0.0.0.0/0"]
      ipv6_cidrs = ["::/0"]
    }
  }
}
